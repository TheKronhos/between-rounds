import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, getActiveBundle, getBundleForDate } from '../lib/db';
import { capitalize, num, time12, todayISO } from '../lib/format';
import {
  PORTION_LABELS,
  sourceLabel,
  canSaveFavorite,
  computeTotals,
  effective,
  findPlannedEntry,
  itemsEqual,
  mealTypeForSlot,
  multLabel,
  newId,
  nowHHMM,
  portionEstimate,
  portionItem,
  putEntry,
  recentItems,
  restoreEntry,
  saveFavoriteFromEntry,
  searchLocal,
  touchFavorites,
  deleteEntry,
  type Match,
  type PortionCounts,
} from '../lib/log';
import { PORTION_KEYS, type LogEntry, type LogItem, type MealType, type PlanBundle } from '../lib/types';
import { useOnline } from '../lib/useToday';
import type { SheetRequest } from './EntrySheetContext';
import { nutritionFor, type FoodHit } from '../lib/foodTable';
import { useFoodSearch } from '../lib/useFoodSearch';
import { MyFoodForm, ServingPicker, type MyFoodDraft } from './FoodPicker';
import { IconChevron, IconClose, IconMinus, IconPlus } from './Icons';
import { NumField, TextField } from './Fields';
import { useToast } from './Toast';

const MULTS = [0.5, 1, 1.5, 2];

export function FoodEntrySheet({ request, onClose }: { request: SheetRequest; onClose: () => void }) {
  const toast = useToast();
  const online = useOnline();
  const editing = request.mode === 'edit' ? request.entry : undefined;
  const replacing = request.mode === 'replace' ? request : undefined;
  const isUnplanned = request.mode === 'add' || editing?.kind === 'unplanned';

  const [date, setDate] = useState(editing?.date ?? replacing?.date ?? todayISO());
  const [time, setTime] = useState(editing?.time ?? replacing?.meal.time ?? nowHHMM());
  const [mealType, setMealType] = useState<MealType>(editing?.meal_type ?? 'meal');
  const [text, setText] = useState(editing?.description ?? '');
  const [items, setItems] = useState<LogItem[]>(editing?.items ?? []);
  const [panel, setPanel] = useState<null | 'portion' | 'manual'>(null);
  const [picking, setPicking] = useState<FoodHit | null>(null);
  const [myFood, setMyFood] = useState<{ title: string; draft: MyFoodDraft } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const foods = useLiveQuery(() => db.foods.toArray(), [], []);
  const recentLogs = useLiveQuery(() => db.logs.orderBy('updated_at').reverse().limit(300).toArray(), [], []);
  const stored = useLiveQuery(async () => (await getBundleForDate(date)) ?? (await getActiveBundle()) ?? null, [date]);
  const bundle = stored?.bundle;

  const recents = useMemo(() => recentItems(recentLogs.filter((e) => e.id !== editing?.id)), [recentLogs, editing?.id]);
  const matches = useMemo(() => searchLocal(text, { foods, recents, bundle }), [text, foods, recents, bundle]);
  const q = text.trim();
  const table = useFoodSearch(picking || myFood ? '' : text);
  // Nothing from my foods/plan, and the table has nothing or only any-word matches.
  const weak = q !== '' && matches.length === 0 && (table.results.length === 0 || table.loose);
  const totals = computeTotals(items);

  // ---- sheet behavior: Android back button / Escape close it; page doesn't scroll behind it ----
  const closedRef = useRef(false);
  useEffect(() => {
    if (!history.state?.sheet) history.pushState({ sheet: true }, '');
    const onPop = () => {
      closedRef.current = true;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The screen behind the sheet can't be tapped or reached by a screen reader while it's open.
    const app = document.querySelector<HTMLElement>('.app');
    if (app) app.inert = true;
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (app) app.inert = false;
    };
  }, []);
  const close = () => {
    if (closedRef.current) return;
    if (history.state?.sheet) history.back();
    else onClose();
  };

  /** Picks from lists start at 1×; the serving picker passes the amount you chose. */
  const addItem = (it: LogItem, keepAmount = false) => setItems((xs) => [...xs, keepAmount ? it : { ...it, multiplier: 1 }]);
  const pickMatch = (m: Match) => {
    addItem(m.item);
    setText('');
  };

  // ---- save ----
  const save = async () => {
    if (!items.length || saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    const description = text.trim();
    // Offline + typed description + rough numbers → flag for refining later (SPEC-logging §3 Tier 4).
    const roughOffline = !online && description !== '' && items.some((i) => i.source === 'portion' || i.source === 'manual');
    let previous: LogEntry | undefined;
    let entry: LogEntry;

    if (request.mode === 'add') {
      entry = {
        id: newId(), date, time, kind: 'unplanned', planned_ref: null, status: 'unplanned', meal_type: mealType,
        description, items, totals, needs_refine: roughOffline, note: '', created_at: now, updated_at: now,
      };
    } else if (request.mode === 'replace') {
      const { meal } = request;
      previous = await findPlannedEntry(request.date, meal.slot);
      entry = {
        id: previous?.id ?? newId(), date: request.date, time: meal.time, kind: 'planned',
        planned_ref: { date: request.date, slot: meal.slot }, status: 'replaced', meal_type: mealTypeForSlot(meal.slot),
        description, items, totals, needs_refine: roughOffline, note: previous?.note ?? '',
        created_at: previous?.created_at ?? now, updated_at: now,
      };
    } else {
      previous = request.entry;
      entry = {
        ...previous,
        date: isUnplanned ? date : previous.date,
        time: isUnplanned ? time : previous.time,
        meal_type: isUnplanned ? mealType : previous.meal_type,
        status: editedStatus(previous, items),
        description,
        items,
        needs_refine: previous.needs_refine || roughOffline,
      };
    }

    const saved = await putEntry(entry);
    await touchFavorites(items);
    close();
    const undo = { label: 'Undo', onClick: () => restoreEntry(saved.id, previous) };
    toast('Logged.', canSaveFavorite(saved)
      ? [{ label: 'Save as favorite', onClick: async () => { await saveFavoriteFromEntry(saved); toast('Saved as favorite.'); } }, undo]
      : [undo], 8000); // longer than the 5 s "Ate it" undo: two choices to read
  };

  const remove = async () => {
    if (!editing) return;
    if (!confirmDelete) return setConfirmDelete(true);
    await deleteEntry(editing.id);
    close();
    toast('Deleted.', [{ label: 'Undo', onClick: async () => void (await db.logs.put(editing)) }]);
  };

  const title =
    request.mode === 'add' ? 'Add meal or snack'
    : request.mode === 'replace' ? 'Ate something else'
    : 'Edit entry';

  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2 id="sheet-title">{title}</h2>
          <button className="btn btn-quiet icon-btn" onClick={close} aria-label="Close">
            <IconClose />
          </button>
        </header>

        <div className="sheet-body">
          {replacing && (
            <p className="muted">
              Instead of {replacing.recipe?.name ?? replacing.meal.recipe_id} · {capitalize(replacing.meal.slot)}, {time12(replacing.meal.time)}
            </p>
          )}
          {editing?.kind === 'planned' && editing.planned_ref && (
            <p className="muted">Planned {editing.planned_ref.slot} · {time12(editing.time)}</p>
          )}

          {isUnplanned && (
            <div className="when-row">
              <div className="segmented" role="group" aria-label="Meal or snack">
                {(['meal', 'snack'] as const).map((t) => (
                  <button key={t} aria-pressed={mealType === t} onClick={() => setMealType(t)}>
                    {capitalize(t)}
                  </button>
                ))}
              </div>
              <input type="date" aria-label="Date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} />
              <input type="time" aria-label="Time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
            </div>
          )}

          <input
            className="food-search"
            type="search"
            enterKeyHint="search"
            placeholder="What did you eat?"
            aria-label="What did you eat?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
          />

          {!online && (
            <p className="offline-note small">
              You're offline. Pick from your foods and plan, or use hand portions or numbers below.
            </p>
          )}

          {items.length > 0 && (
            <section aria-label="In this entry" className="stack-sm">
              <h3 className="group-head">In this entry</h3>
              {items.map((it, i) => (
                <ItemEditor
                  key={i}
                  item={it}
                  onChange={(next) => setItems((xs) => xs.map((x, j) => (j === i ? next : x)))}
                  onRemove={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                />
              ))}
            </section>
          )}

          {picking ? (
            <ServingPicker
              food={picking}
              onBack={() => setPicking(null)}
              onAdd={(it) => {
                addItem(it, true);
                setPicking(null);
                setText('');
              }}
              onSaveAsMine={(draft) => {
                setPicking(null);
                setMyFood({ title: 'Save as my food', draft });
              }}
            />
          ) : myFood ? (
            <MyFoodForm
              title={myFood.title}
              draft={myFood.draft}
              onCancel={() => setMyFood(null)}
              onDone={(added) => {
                setMyFood(null);
                setText('');
                if (added) addItem(added);
                toast('Saved to My foods.');
              }}
            />
          ) : (
          <>
          <MatchList matches={matches} onPick={pickMatch} />

          {q && table.results.length > 0 && (
            <section aria-label="USDA (offline)">
              <h3 className="group-head">{weak ? 'Closest in the food table' : 'USDA (offline)'}</h3>
              <ul className="match-list">
                {table.results.map((f) => {
                  const [label, grams] = f.portions[0];
                  return (
                    <li key={f.fdcId}>
                      <button className="match" onClick={() => setPicking(f)}>
                        <span className="match-text">
                          <span className="match-name">{f.display}</span>
                          <span className="match-detail">
                            {label} · {num(nutritionFor(f, grams).kcal)} kcal · USDA (offline)
                          </span>
                        </span>
                        <IconChevron />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {!q && matches.length === 0 && <p className="muted small match-empty">Your foods and recent entries will show here.</p>}
          {q && table.status === 'loading' && matches.length === 0 && <p className="muted small match-empty">Loading the food table…</p>}
          {q && table.status === 'error' && <p className="muted small match-empty">The food table couldn't load. Your foods, plan and the options below still work.</p>}
          {q && weak && table.status !== 'loading' && (
            <div className="create-food">
              {table.results.length === 0 && <p className="muted small">No matches for "{q}".</p>}
              <button
                className="btn"
                onClick={() =>
                  setMyFood({
                    title: 'Create food',
                    draft: { name: q, portion: '1 serving', origin: 'manual', kcal: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null },
                  })
                }
              >
                <IconPlus /> Create food "{q}"
              </button>
            </div>
          )}

          <section className="tier4" aria-label="Other ways to add">
            <div className="tier4-buttons">
              <button className="btn" aria-expanded={panel === 'portion'} onClick={() => setPanel(panel === 'portion' ? null : 'portion')}>
                Hand portions
              </button>
              <button className="btn" aria-expanded={panel === 'manual'} onClick={() => setPanel(panel === 'manual' ? null : 'manual')}>
                Enter numbers
              </button>
            </div>
            {panel === 'portion' && (
              <PortionPanel
                guide={bundle?.targets.portion_guide}
                onAdd={(counts) => {
                  addItem(portionItem(counts, bundle!.targets.portion_guide, text));
                  setPanel(null);
                }}
              />
            )}
            {panel === 'manual' && (
              <ManualPanel
                initialName={text}
                onAdd={(it) => {
                  addItem(it);
                  setPanel(null);
                }}
              />
            )}
          </section>
          </>
          )}
        </div>

        <footer className="sheet-foot">
          {editing && (
            <button className="btn" onClick={remove}>
              {confirmDelete ? 'Tap again to delete' : 'Delete'}
            </button>
          )}
          <button className="btn btn-primary btn-save" disabled={!items.length || saving} onClick={save}>
            {items.length ? `Save · ${num(totals.kcal)} kcal` : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Status after editing a planned entry, so the check-in reflects what actually happened. */
function editedStatus(prev: LogEntry, items: LogItem[]): LogEntry['status'] {
  if (prev.kind === 'unplanned') return 'unplanned';
  if (itemsEqual(items, prev.items)) return prev.status;
  if (items.length === 0) return prev.status;
  const [a] = items;
  const [b] = prev.items;
  const onlyMultiplierChanged =
    items.length === 1 && prev.items.length === 1 && a.source === 'plan' && b.source === 'plan' &&
    itemsEqual([{ ...a, multiplier: 1 }], [{ ...b, multiplier: 1 }]);
  if (onlyMultiplierChanged && (prev.status === 'as_planned' || prev.status === 'portion')) {
    return a.multiplier === 1 ? 'as_planned' : 'portion';
  }
  return 'replaced';
}

// ---------- pieces ----------

function MatchList({ matches, onPick }: { matches: Match[]; onPick: (m: Match) => void }) {
  if (!matches.length) return null;
  const groups: Record<string, Match[]> = {};
  for (const m of matches) (groups[m.group] ??= []).push(m);
  return (
    <>
      {Object.entries(groups).map(([g, ms]) => (
        <section key={g} aria-label={g}>
          <h3 className="group-head">{g}</h3>
          <ul className="match-list">
            {ms.map((m) => (
              <li key={m.key}>
                <button className="match" onClick={() => onPick(m)}>
                  <span className="match-text">
                    <span className="match-name">{m.item.name}</span>
                    <span className="match-detail">
                      {m.detail} · {num(m.item.kcal)} kcal · {num(m.item.protein_g)} g P
                    </span>
                  </span>
                  <IconPlus />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function ItemEditor({ item, onChange, onRemove }: { item: LogItem; onChange: (it: LogItem) => void; onRemove: () => void }) {
  const [editNums, setEditNums] = useState(false);
  const e = effective(item);
  const set = (patch: Partial<LogItem>) => onChange({ ...item, ...patch });
  return (
    <div className="item-card">
      <div className="item-top">
        <div>
          <div className="item-name">{item.name}</div>
          <div className="small muted">
            {[item.portion, sourceLabel(item)].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button className="btn btn-quiet icon-btn" onClick={onRemove} aria-label={`Remove ${item.name}`}>
          <IconClose />
        </button>
      </div>
      <div className="segmented mult" role="group" aria-label="Amount">
        {(MULTS.includes(item.multiplier) ? MULTS : [...MULTS, item.multiplier].sort((a, b) => a - b)).map((m) => (
          <button key={m} aria-pressed={item.multiplier === m} onClick={() => set({ multiplier: m })}>
            {multLabel(m)}
          </button>
        ))}
      </div>
      <div className="item-macros">
        {num(e.kcal)} kcal · {num(e.protein_g)} g P · {num(e.carbs_g)} g C · {num(e.fat_g)} g F
        {e.fiber_g !== null && ` · ${num(e.fiber_g)} g fiber`}
      </div>
      <button className="btn btn-quiet edit-nums" aria-expanded={editNums} onClick={() => setEditNums(!editNums)}>
        {editNums ? 'Done editing' : 'Edit numbers'}
      </button>
      {editNums && (
        <div className="num-grid">
          <TextField label="Name" value={item.name} onChange={(v) => set({ name: v })} wide />
          <TextField label="Portion" value={item.portion} onChange={(v) => set({ portion: v })} wide />
          <NumField label="kcal (for 1×)" value={item.kcal} onChange={(v) => set({ kcal: v ?? 0 })} />
          <NumField label="Protein g" value={item.protein_g} onChange={(v) => set({ protein_g: v ?? 0 })} />
          <NumField label="Carbs g" value={item.carbs_g} onChange={(v) => set({ carbs_g: v ?? 0 })} />
          <NumField label="Fat g" value={item.fat_g} onChange={(v) => set({ fat_g: v ?? 0 })} />
          <NumField label="Fiber g" value={item.fiber_g} onChange={(v) => set({ fiber_g: v })} optional />
        </div>
      )}
    </div>
  );
}

function PortionPanel({ guide, onAdd }: { guide: PlanBundle['targets']['portion_guide'] | undefined; onAdd: (c: PortionCounts) => void }) {
  const [counts, setCounts] = useState<PortionCounts>({ palm_protein: 0, fist_veg: 0, cupped_hand_carb: 0, thumb_fat: 0 });
  if (!guide) {
    return <p className="muted small panel">Hand portions use the factors from your plan. Import a plan first.</p>;
  }
  const est = portionEstimate(counts, guide);
  const any = PORTION_KEYS.some((k) => counts[k] > 0);
  const step = (k: keyof PortionCounts, d: number) => setCounts((c) => ({ ...c, [k]: Math.max(0, Math.min(10, c[k] + d)) }));
  return (
    <div className="panel stack-sm">
      {PORTION_KEYS.map((k) => (
        <div key={k} className="stepper-row">
          <span className="stepper-label">
            {capitalize(PORTION_LABELS[k].many)} <span className="muted">· {PORTION_LABELS[k].what}</span>
          </span>
          <div className="stepper">
            <button className="btn icon-btn" onClick={() => step(k, -0.5)} aria-label={`Fewer ${PORTION_LABELS[k].many}`} disabled={counts[k] === 0}>
              <IconMinus />
            </button>
            <output aria-live="polite">{counts[k] % 1 ? counts[k].toFixed(1) : counts[k]}</output>
            <button className="btn icon-btn" onClick={() => step(k, 0.5)} aria-label={`More ${PORTION_LABELS[k].many}`}>
              <IconPlus />
            </button>
          </div>
        </div>
      ))}
      <p className="small muted">
        About {num(est.kcal)} kcal · {num(est.protein_g)} g P · {num(est.carbs_g)} g C · {num(est.fat_g)} g F
      </p>
      <button className="btn btn-primary" disabled={!any} onClick={() => onAdd(counts)}>
        Add to entry
      </button>
    </div>
  );
}

function ManualPanel({ initialName, onAdd }: { initialName: string; onAdd: (it: LogItem) => void }) {
  const [name, setName] = useState(initialName);
  const [portion, setPortion] = useState('');
  const [v, setV] = useState<{ kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; fiber_g: number | null }>({
    kcal: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null,
  });
  const ok = name.trim() !== '' && v.kcal !== null;
  return (
    <div className="panel">
      <div className="num-grid">
        <TextField label="Name" value={name} onChange={setName} wide />
        <TextField label="Portion (optional)" value={portion} onChange={setPortion} wide />
        <NumField label="kcal" value={v.kcal} onChange={(x) => setV({ ...v, kcal: x })} optional />
        <NumField label="Protein g" value={v.protein_g} onChange={(x) => setV({ ...v, protein_g: x })} optional />
        <NumField label="Carbs g" value={v.carbs_g} onChange={(x) => setV({ ...v, carbs_g: x })} optional />
        <NumField label="Fat g (optional)" value={v.fat_g} onChange={(x) => setV({ ...v, fat_g: x })} optional />
        <NumField label="Fiber g (optional)" value={v.fiber_g} onChange={(x) => setV({ ...v, fiber_g: x })} optional />
      </div>
      <button
        className="btn btn-primary"
        style={{ marginTop: 12 }}
        disabled={!ok}
        onClick={() =>
          onAdd({
            name: name.trim(), portion: portion.trim(), multiplier: 1,
            kcal: v.kcal ?? 0, protein_g: v.protein_g ?? 0, carbs_g: v.carbs_g ?? 0, fat_g: v.fat_g ?? 0, fiber_g: v.fiber_g,
            source: 'manual', source_ref: null, confidence: null,
          })
        }
      >
        Add to entry
      </button>
      {!ok && <p className="small muted" style={{ marginTop: 6 }}>Name and kcal are needed.</p>}
    </div>
  );
}
