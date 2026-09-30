// Log entry logic (SPEC-logging.md). Pure helpers first, then database operations.
// Nothing here changes the plan or its targets; entries only record what was eaten.

import { db } from './db';
import { qty } from './format';
import {
  PORTION_KEYS,
  type LogEntry,
  type LogItem,
  type Macros,
  type Nutrition,
  type PlannedMeal,
  type PlanBundle,
  type PortionKey,
  type Recipe,
  type SavedFood,
  type Swap,
} from './types';

// ---------- ids & time ----------

/** UUID v4. Uses getRandomValues so it also works over plain http on the local network. */
export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function nowHHMM(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// ---------- nutrition math ----------

export function effective(item: LogItem): Nutrition {
  const m = item.multiplier;
  return {
    kcal: item.kcal * m,
    protein_g: item.protein_g * m,
    carbs_g: item.carbs_g * m,
    fat_g: item.fat_g * m,
    fiber_g: item.fiber_g === null ? null : item.fiber_g * m,
  };
}

/** Entry totals are always the sum of items × multiplier. Fiber is null only if no item has it. */
export function computeTotals(items: LogItem[]): Nutrition {
  const t: Nutrition = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: null };
  for (const it of items) {
    const e = effective(it);
    t.kcal += e.kcal;
    t.protein_g += e.protein_g;
    t.carbs_g += e.carbs_g;
    t.fat_g += e.fat_g;
    if (e.fiber_g !== null) t.fiber_g = (t.fiber_g ?? 0) + e.fiber_g;
  }
  return t;
}

export function sumTotals(entries: LogEntry[]): Nutrition {
  return computeTotals(entries.map((e) => ({ ...e.totals, name: '', portion: '', multiplier: 1, source: 'manual', source_ref: null, confidence: null })));
}

// ---------- building items ----------

const fromMacros = (m: Macros, fiber: number | null = null) => ({
  kcal: m.kcal,
  protein_g: m.protein_g,
  carbs_g: m.carbs_g,
  fat_g: m.fat_g,
  fiber_g: fiber,
});

/** The planned meal exactly as the bundle states it. */
export function plannedItem(meal: PlannedMeal, recipe: Recipe | undefined): LogItem {
  const variant = meal.variant ? recipe?.variants.find((v) => v.id === meal.variant) : undefined;
  const name = (recipe?.name ?? meal.recipe_id) + (variant ? ` (${variant.label})` : '');
  return {
    name,
    portion: meal.servings === 1 ? '1 serving' : `${qty(meal.servings)} servings`,
    multiplier: 1,
    ...fromMacros(meal),
    source: 'plan',
    source_ref: meal.recipe_id,
    confidence: null,
  };
}

export function swapItem(swap: Swap, recipeId: string): LogItem {
  return { name: swap.label, portion: '1 serving', multiplier: 1, ...fromMacros(swap), source: 'swap', source_ref: recipeId, confidence: null };
}

export function savedFoodItem(f: SavedFood): LogItem {
  return {
    name: f.name,
    portion: f.portion,
    multiplier: 1,
    kcal: f.kcal,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fat_g: f.fat_g,
    fiber_g: f.fiber_g,
    source: 'saved',
    source_ref: f.id,
    confidence: null,
  };
}

export type PortionCounts = Record<PortionKey, number>;

export const PORTION_LABELS: Record<PortionKey, { one: string; many: string; what: string }> = {
  palm_protein: { one: 'palm', many: 'palms', what: 'protein' },
  fist_veg: { one: 'fist', many: 'fists', what: 'veg' },
  cupped_hand_carb: { one: 'cupped hand', many: 'cupped hands', what: 'carbs' },
  thumb_fat: { one: 'thumb', many: 'thumbs', what: 'fat' },
};

/** Hand-portion estimate using the bundle's portion_guide factors (never hardcoded). */
export function portionEstimate(counts: PortionCounts, guide: PlanBundle['targets']['portion_guide']): Nutrition {
  const t: Nutrition = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: null };
  for (const k of PORTION_KEYS) {
    const n = counts[k] ?? 0;
    t.kcal += guide[k].kcal * n;
    t.protein_g += guide[k].protein_g * n;
    t.carbs_g += guide[k].carbs_g * n;
    t.fat_g += guide[k].fat_g * n;
  }
  return t;
}

export function portionDescription(counts: PortionCounts): string {
  return PORTION_KEYS.filter((k) => counts[k] > 0)
    .map((k) => `${qty(counts[k])} ${counts[k] <= 1 ? PORTION_LABELS[k].one : PORTION_LABELS[k].many} ${PORTION_LABELS[k].what}`)
    .join(', ');
}

export function portionItem(counts: PortionCounts, guide: PlanBundle['targets']['portion_guide'], name: string): LogItem {
  return {
    name: name.trim() || 'Hand-portion estimate',
    portion: portionDescription(counts),
    multiplier: 1,
    ...portionEstimate(counts, guide),
    source: 'portion',
    source_ref: null,
    confidence: null,
  };
}

// ---------- labels ----------

export function mealTypeForSlot(slot: string): 'meal' | 'snack' {
  return /snack/i.test(slot) ? 'snack' : 'meal';
}

const MULT_LABEL: Record<string, string> = { '0.5': '½×', '1': '1×', '1.5': '1.5×', '2': '2×' };
export const multLabel = (m: number) => MULT_LABEL[String(m)] ?? `${qty(m)}×`;

export function statusLabel(e: LogEntry): string {
  switch (e.status) {
    case 'as_planned': return 'Ate it';
    case 'portion': return `Ate ${multLabel(e.items[0]?.multiplier ?? 1)} portion`;
    case 'swapped': return `Swapped: ${e.items[0]?.name ?? ''}`;
    case 'replaced': return 'Ate something else';
    case 'skipped': return 'Skipped';
    case 'unplanned': return e.meal_type === 'snack' ? 'Snack' : 'Meal';
  }
}

export const SOURCE_LABEL: Record<LogItem['source'], string> = {
  plan: 'From plan',
  swap: 'Plan swap',
  saved: 'My food',
  ai: 'AI estimate',
  usda: 'USDA',
  off: 'Open Food Facts',
  portion: 'Hand portions',
  manual: 'Manual',
};

/** Source shown on an item. Offline food-table items say so (source_ref "sr:<fdcId>" or "fndds:<fdcId>"). */
export function sourceLabel(it: LogItem): string {
  if (it.source === 'usda' && /^(sr|fndds):/.test(it.source_ref ?? '')) return 'USDA (offline)';
  return SOURCE_LABEL[it.source];
}

export function entryTitle(e: LogEntry): string {
  if (e.items.length === 0) return e.description || e.planned_ref?.slot || 'Entry';
  if (e.items.length === 1) return e.items[0].name;
  return e.description || e.items.map((i) => i.name).join(', ');
}

// ---------- Tier 1 local search ----------

export interface Match {
  key: string;
  group: 'My foods' | 'Recent' | 'Plan recipes';
  item: LogItem;
  detail: string;
  savedFoodId?: string;
}

/** Most recent distinct items from past entries (newest first). */
export function recentItems(entries: LogEntry[], limit = 40): LogItem[] {
  const seen = new Set<string>();
  const out: LogItem[] = [];
  const sorted = entries.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  for (const e of sorted) {
    for (const it of e.items) {
      const k = `${it.name.toLowerCase()}|${Math.round(it.kcal)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...it, multiplier: 1 });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function planItems(bundle: PlanBundle | undefined): { item: LogItem; detail: string }[] {
  if (!bundle) return [];
  const out: { item: LogItem; detail: string }[] = [];
  for (const r of bundle.recipes) {
    out.push({
      item: { name: r.name, portion: '1 serving', multiplier: 1, ...fromMacros(r.per_serving), source: 'plan', source_ref: r.id, confidence: null },
      detail: 'Recipe',
    });
    for (const v of r.variants) {
      out.push({
        item: { name: `${r.name} (${v.label})`, portion: '1 serving', multiplier: 1, ...fromMacros(v), source: 'plan', source_ref: `${r.id}#${v.id}`, confidence: null },
        detail: 'Recipe variant',
      });
    }
    for (const s of r.swaps) out.push({ item: swapItem(s, r.id), detail: `Swap for ${r.name}` });
  }
  return out;
}

function score(name: string, tokens: string[]): number {
  const n = name.toLowerCase();
  if (!tokens.every((t) => n.includes(t))) return -1;
  let s = 0;
  if (n.startsWith(tokens[0])) s += 2;
  if (tokens.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(n))) s += 1;
  return s;
}

/**
 * Tier 1: saved foods, recent entries, and every plan recipe/variant/swap.
 * With an empty query, returns saved foods and recent items (so a repeat food is one tap).
 */
export function searchLocal(
  query: string,
  src: { foods: SavedFood[]; recents: LogItem[]; bundle?: PlanBundle },
  limit = 12,
): Match[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out: Match[] = [];
  const seen = new Set<string>();
  const add = (m: Match, s: number, bucket: [Match, number][]) => {
    const k = `${m.item.name.toLowerCase()}|${Math.round(m.item.kcal)}`;
    if (seen.has(k)) return;
    seen.add(k);
    bucket.push([m, s]);
  };

  const groups: [Match, number][][] = [[], [], []];
  const foods = src.foods.slice().sort((a, b) => b.last_used_at.localeCompare(a.last_used_at));
  for (const f of foods) {
    const s = tokens.length ? score(f.name, tokens) : 0;
    if (s >= 0) add({ key: `f:${f.id}`, group: 'My foods', item: savedFoodItem(f), detail: f.portion, savedFoodId: f.id }, s, groups[0]);
  }
  src.recents.forEach((it, i) => {
    const s = tokens.length ? score(it.name, tokens) : 0;
    if (s >= 0) add({ key: `r:${i}`, group: 'Recent', item: it, detail: it.portion || sourceLabel(it) }, s, groups[1]);
  });
  if (tokens.length) {
    planItems(src.bundle).forEach(({ item, detail }, i) => {
      const s = score(item.name, tokens);
      if (s >= 0) add({ key: `p:${i}`, group: 'Plan recipes', item, detail }, s, groups[2]);
    });
  }
  for (const g of groups) {
    g.sort((a, b) => b[1] - a[1]);
    out.push(...g.map(([m]) => m));
  }
  return tokens.length ? out.slice(0, limit) : out.slice(0, 8);
}

// ---------- entries: build & store ----------

export function finalizeEntry(e: Omit<LogEntry, 'totals' | 'updated_at'> & Partial<Pick<LogEntry, 'updated_at'>>): LogEntry {
  return { ...e, totals: computeTotals(e.items), updated_at: new Date().toISOString() };
}

export async function putEntry(e: LogEntry): Promise<LogEntry> {
  const row = finalizeEntry(e);
  await db.logs.put(row);
  return row;
}

export async function deleteEntry(id: string) {
  await db.logs.delete(id);
}

export async function entriesForDate(date: string): Promise<LogEntry[]> {
  const rows = await db.logs.where('date').equals(date).toArray();
  return rows.sort((a, b) => a.time.localeCompare(b.time) || a.created_at.localeCompare(b.created_at));
}

export async function findPlannedEntry(date: string, slot: string): Promise<LogEntry | undefined> {
  return db.logs
    .where('date')
    .equals(date)
    .filter((e) => e.kind === 'planned' && e.planned_ref?.slot === slot && e.planned_ref.date === date)
    .first();
}

export type PlannedAction =
  | { type: 'as_planned' }
  | { type: 'portion'; multiplier: number }
  | { type: 'swapped'; swap: Swap }
  | { type: 'skipped' };

/**
 * Record what happened to a planned meal. Replaces any earlier entry for the same
 * planned meal (keeping its id) and returns the previous entry so the caller can undo.
 */
export async function logPlannedMeal(
  date: string,
  meal: PlannedMeal,
  recipe: Recipe | undefined,
  action: PlannedAction,
): Promise<{ entry: LogEntry; previous: LogEntry | undefined }> {
  const previous = await findPlannedEntry(date, meal.slot);
  let items: LogItem[] = [];
  if (action.type === 'as_planned') items = [plannedItem(meal, recipe)];
  if (action.type === 'portion') items = [{ ...plannedItem(meal, recipe), multiplier: action.multiplier }];
  if (action.type === 'swapped') items = [swapItem(action.swap, meal.recipe_id)];
  const now = new Date().toISOString();
  const entry = await putEntry({
    id: previous?.id ?? newId(),
    date,
    time: meal.time,
    kind: 'planned',
    planned_ref: { date, slot: meal.slot },
    status: action.type,
    meal_type: mealTypeForSlot(meal.slot),
    description: '',
    items,
    totals: computeTotals(items),
    needs_refine: false,
    note: previous?.note ?? '',
    created_at: previous?.created_at ?? now,
    updated_at: now,
  });
  return { entry, previous };
}

/** Undo: put back what was there before (or remove the entry if nothing was). */
export async function restoreEntry(id: string, previous: LogEntry | undefined) {
  if (previous) await db.logs.put(previous);
  else await db.logs.delete(id);
}

export function itemsEqual(a: LogItem[], b: LogItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------- favorites ----------

/** Save what was eaten as a favorite. Multi-item entries become one combined food. */
export async function saveFavoriteFromEntry(e: LogEntry): Promise<SavedFood> {
  const now = new Date().toISOString();
  const single = e.items.length === 1 ? e.items[0] : undefined;
  const n = single ? effective(single) : e.totals;
  const food: SavedFood = {
    id: newId(),
    name: single ? single.name : entryTitle(e),
    portion: single ? (single.multiplier === 1 ? single.portion : `${multLabel(single.multiplier)} ${single.portion}`.trim()) : '1 serving',
    kcal: n.kcal,
    protein_g: n.protein_g,
    carbs_g: n.carbs_g,
    fat_g: n.fat_g,
    fiber_g: n.fiber_g,
    origin: single ? single.source : 'manual',
    created_at: now,
    last_used_at: now,
  };
  await db.foods.add(food);
  return food;
}

export async function touchFavorites(items: LogItem[]) {
  const now = new Date().toISOString();
  await Promise.all(
    items.filter((i) => i.source === 'saved' && i.source_ref).map((i) => db.foods.update(i.source_ref!, { last_used_at: now })),
  );
}

/** Offer "Save as favorite" only when the entry isn't already exactly one saved food. */
export function canSaveFavorite(e: LogEntry): boolean {
  if (e.items.length === 0) return false;
  return !(e.items.length === 1 && e.items[0].source === 'saved' && e.items[0].multiplier === 1);
}
