import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type ReactNode } from 'react';
import { DayTotals } from '../components/DayTotals';
import { DayTypeChip, TrainingChip } from '../components/DayTypeChip';
import { useEntrySheet } from '../components/EntrySheetContext';
import { EntryRow } from '../components/EntryRow';
import { IconCheck, IconChevron } from '../components/Icons';
import { NoPlan } from '../components/NoPlan';
import { useToast } from '../components/Toast';
import { getBundleForDate } from '../lib/db';
import { capitalize, longDate, num, time12 } from '../lib/format';
import { entriesForDate, entryTitle, logPlannedMeal, multLabel, restoreEntry, statusLabel, sumTotals, type PlannedAction } from '../lib/log';
import { href } from '../lib/router';
import type { LogEntry, PlannedMeal, Recipe } from '../lib/types';
import { useToday } from '../lib/useToday';

// Phase scope: planned meal cards, unplanned entries, and totals (SPEC-logging Phase 1).
// Reminders, "Tomorrow needs", training marker and water arrive with SPEC.md Phase 3.

export function TodayScreen() {
  const today = useToday();
  const stored = useLiveQuery(async () => (await getBundleForDate(today)) ?? null, [today]);
  const entries = useLiveQuery(() => entriesForDate(today), [today]);
  if (stored === undefined || entries === undefined) return null;

  const bundle = stored?.bundle;
  const day = bundle?.days.find((d) => d.date === today);
  const target = day && bundle ? bundle.targets.day_types[day.day_type] : undefined;
  const recipes = new Map(bundle?.recipes.map((r) => [r.id, r]) ?? []);
  const plannedEntry = (slot: string) => entries.find((e) => e.kind === 'planned' && e.planned_ref?.slot === slot);

  type Row = { time: string; key: string; node: ReactNode };
  const rows: Row[] = [];
  for (const meal of day?.meals ?? []) {
    rows.push({
      time: meal.time,
      key: `m:${meal.slot}`,
      node: <MealCard date={today} meal={meal} recipe={recipes.get(meal.recipe_id)} entry={plannedEntry(meal.slot)} />,
    });
  }
  // Planned entries whose slot no longer exists in the plan (e.g. plan re-imported) still show.
  const slots = new Set(day?.meals.map((m) => m.slot));
  for (const e of entries) {
    if (e.kind === 'unplanned' || !slots.has(e.planned_ref?.slot ?? '')) {
      rows.push({ time: e.time, key: `e:${e.id}`, node: <EntryRow entry={e} /> });
    }
  }
  rows.sort((a, b) => a.time.localeCompare(b.time));

  return (
    <>
      <header className="page-head" style={{ display: 'block' }}>
        <h1>Today</h1>
        <p className="sub">{longDate(today)}</p>
        {day && bundle && (
          <div className="day-chips" style={{ marginTop: 10 }}>
            <DayTypeChip dayType={day.day_type} targets={bundle.targets} />
            {day.training && <TrainingChip />}
          </div>
        )}
      </header>

      {!bundle && entries.length === 0 && <NoPlan />}
      {bundle && !day && <div className="card muted">Your plan has nothing for today. You can still log with the + button.</div>}

      <div className="today-layout">
        <DayTotals totals={sumTotals(entries)} target={target} />
        <ol className="timeline" aria-label="Today's meals">
          {rows.map((r) => (
            <li key={r.key}>{r.node}</li>
          ))}
        </ol>
      </div>
    </>
  );
}

function MealCard({ date, meal, recipe, entry }: { date: string; meal: PlannedMeal; recipe: Recipe | undefined; entry: LogEntry | undefined }) {
  const toast = useToast();
  const openSheet = useEntrySheet();
  const [changing, setChanging] = useState(false);
  const [more, setMore] = useState(false);
  const variant = meal.variant ? recipe?.variants.find((v) => v.id === meal.variant) : undefined;

  const act = async (action: PlannedAction) => {
    const { entry: saved, previous } = await logPlannedMeal(date, meal, recipe, action);
    setChanging(false);
    setMore(false);
    toast('Logged.', [{ label: 'Undo', onClick: () => restoreEntry(saved.id, previous) }]);
  };

  const logged = entry && !changing;
  return (
    <article className={`card meal-card${logged ? ' is-logged' : ''}`}>
      <div className="meal-when">
        {time12(meal.time)} · {capitalize(meal.slot)}
      </div>
      <a className="meal-card-name" href={href(`/recipes/${encodeURIComponent(meal.recipe_id)}${meal.variant ? `?v=${encodeURIComponent(meal.variant)}` : ''}`)}>
        {recipe?.name ?? meal.recipe_id}
        {variant && <span className="muted"> · {variant.label}</span>}
        {meal.servings !== 1 && <span className="muted"> ×{meal.servings}</span>}
      </a>
      <div className="meal-macros">
        Planned {num(meal.kcal)} kcal · {num(meal.protein_g)} g protein
      </div>
      {meal.notes && <div className="meal-extra">{meal.notes}</div>}

      {logged ? (
        <div className="logged-row">
          <div className="logged-status">
            <IconCheck />
            <span>
              <strong>{statusLabel(entry)}</strong>
              {entry.status === 'replaced' && `: ${entryTitle(entry)}`}
              {entry.status !== 'skipped' && <span className="muted"> · {num(entry.totals.kcal)} kcal · {num(entry.totals.protein_g)} g P</span>}
            </span>
          </div>
          <div className="btn-row">
            <button className="btn" onClick={() => setChanging(true)}>Change</button>
            {entry.status !== 'skipped' && (
              <button className="btn" onClick={() => openSheet({ mode: 'edit', entry })}>Edit</button>
            )}
          </div>
        </div>
      ) : (
        <div className="meal-actions">
          <button className="btn btn-primary btn-big" onClick={() => act({ type: 'as_planned' })}>
            <IconCheck /> Ate it
          </button>
          <div className="meal-actions-secondary">
            <button className="btn" onClick={() => openSheet({ mode: 'replace', date, meal, recipe })}>
              Ate something else
            </button>
            <button className="btn" aria-expanded={more} onClick={() => setMore(!more)}>
              More <IconChevron dir={more ? 'up' : 'down'} size={18} />
            </button>
          </div>
          {more && (
            <div className="more-menu">
              <div className="more-label">Portion</div>
              <div className="segmented" role="group" aria-label="Portion">
                {[0.5, 1.5, 2].map((m) => (
                  <button key={m} onClick={() => act({ type: 'portion', multiplier: m })}>
                    {multLabel(m)}
                  </button>
                ))}
              </div>
              <div className="more-label">Swapped</div>
              {recipe?.swaps.length ? (
                <div className="stack-sm">
                  {recipe.swaps.map((s) => (
                    <button key={s.label} className="btn swap-btn" onClick={() => act({ type: 'swapped', swap: s })}>
                      <span>{s.label}</span>
                      <span className="muted small">{num(s.kcal)} kcal · {num(s.protein_g)} g P</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="small muted">No swaps in the plan for this recipe.</p>
              )}
              <button className="btn" style={{ marginTop: 12 }} onClick={() => act({ type: 'skipped' })}>
                Skipped
              </button>
            </div>
          )}
          {changing && (
            <button className="btn btn-quiet" onClick={() => { setChanging(false); setMore(false); }}>
              Keep as is
            </button>
          )}
        </div>
      )}
    </article>
  );
}
