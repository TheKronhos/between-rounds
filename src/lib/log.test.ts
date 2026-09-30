import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import sample from './sample-bundle.json';
import { BetweenRoundsDB, db, importBundle } from './db';
import {
  computeTotals,
  entriesForDate,
  logPlannedMeal,
  newId,
  plannedItem,
  portionItem,
  recentItems,
  restoreEntry,
  saveFavoriteFromEntry,
  searchLocal,
  canSaveFavorite,
} from './log';
import type { LogItem, PlanBundle } from './types';
import { validateBundle } from './validate';

const bundle = validateBundle(structuredClone(sample)).bundle as PlanBundle;
const item = (o: Partial<LogItem>): LogItem => ({
  name: 'x', portion: '', multiplier: 1, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: null,
  source: 'manual', source_ref: null, confidence: null, ...o,
});

describe('upgrade from v1 (plans only) to v2 (logs)', () => {
  it('keeps every existing plan and meta row', async () => {
    const name = 'upgrade-test';
    const v1 = new Dexie(name);
    v1.version(1).stores({ bundles: '++id, plan_id, imported_at, valid_from, valid_to', meta: '&key' });
    await v1.table('bundles').add({ plan_id: 'p1', data_version: '1.0', valid_from: '2026-09-27', valid_to: '2026-10-03', imported_at: '2026-09-27T12:00:00Z', bundle });
    await v1.table('bundles').add({ plan_id: 'p0', data_version: '1.0', valid_from: '2026-09-20', valid_to: '2026-09-26', imported_at: '2026-09-20T12:00:00Z', bundle });
    await v1.table('meta').put({ key: 'k', value: 42 });
    v1.close();

    const v2 = new BetweenRoundsDB(name);
    await v2.open();
    expect(v2.verno).toBe(2);
    expect((await v2.bundles.toArray()).map((b) => b.plan_id).sort()).toEqual(['p0', 'p1']);
    expect((await v2.bundles.get(1))!.bundle.recipes).toHaveLength(bundle.recipes.length);
    expect(await v2.meta.get('k')).toEqual({ key: 'k', value: 42 });
    expect(await v2.logs.count()).toBe(0);
    expect(await v2.foods.count()).toBe(0);
    v2.close();
  });
});

describe('totals', () => {
  it('sums items × multiplier; fiber null unless some item has it', () => {
    const t = computeTotals([item({ kcal: 100, protein_g: 10, multiplier: 1.5 }), item({ kcal: 50, carbs_g: 5 })]);
    expect(t).toEqual({ kcal: 200, protein_g: 15, carbs_g: 5, fat_g: 0, fiber_g: null });
    expect(computeTotals([item({ fiber_g: 4, multiplier: 0.5 }), item({})]).fiber_g).toBe(2);
    expect(computeTotals([]).kcal).toBe(0);
  });
});

describe('portion quick-add', () => {
  it('uses the bundle portion_guide factors', () => {
    const it = portionItem({ palm_protein: 2, fist_veg: 1, cupped_hand_carb: 0.5, thumb_fat: 0 }, bundle.targets.portion_guide, '');
    // 2×150 + 1×25 + 0.5×120
    expect(it.kcal).toBe(385);
    expect(it.protein_g).toBe(2 * 28 + 1 + 1.5);
    expect(it.portion).toBe('2 palms protein, 1 fist veg, ½ cupped hand carbs');
    expect(it.name).toBe('Hand-portion estimate');
  });
});

describe('local search', () => {
  const recipe = bundle.recipes.find((r) => r.id === 'ip-salsa-chicken')!;
  it('finds recipes, variants and swaps by any word', () => {
    const names = searchLocal('turkey', { foods: [], recents: [], bundle }).map((m) => m.item.name);
    expect(names).toContain('Turkey Club Wraps');
    expect(names).toContain('Ground turkey taco meat');
    expect(searchLocal('bowl hard', { foods: [], recents: [], bundle }).map((m) => m.item.name)).toContain('Salsa Chicken Burrito Bowl (Hard day)');
  });
  it('puts saved foods first and shows them with an empty query', () => {
    const food = { id: 'f1', name: 'Salsa chicken tacos', portion: '3 tacos', kcal: 500, protein_g: 40, carbs_g: 30, fat_g: 20, fiber_g: 6, origin: 'manual' as const, created_at: '', last_used_at: '2026-09-28' };
    const m = searchLocal('salsa', { foods: [food], recents: [], bundle });
    expect(m[0].group).toBe('My foods');
    expect(m[0].item.source).toBe('saved');
    expect(searchLocal('', { foods: [food], recents: [], bundle })).toHaveLength(1);
    expect(recipe).toBeDefined();
  });
});

describe('planned meal actions (database)', () => {
  beforeEach(async () => {
    await db.logs.clear();
    await db.foods.clear();
    await db.bundles.clear();
    await importBundle(bundle);
  });
  const day = bundle.days[1]; // 2026-09-28, hard day
  const lunch = day.meals.find((m) => m.slot === 'lunch')!;
  const recipe = bundle.recipes.find((r) => r.id === lunch.recipe_id);

  it('Ate it logs the bundle nutrition exactly', async () => {
    const { entry, previous } = await logPlannedMeal(day.date, lunch, recipe, { type: 'as_planned' });
    expect(previous).toBeUndefined();
    expect(entry.status).toBe('as_planned');
    expect(entry.planned_ref).toEqual({ date: '2026-09-28', slot: 'lunch' });
    expect(entry.totals.kcal).toBe(lunch.kcal);
    expect(entry.items[0].name).toBe('Salsa Chicken Burrito Bowl (Hard day)');
  });

  it('a second action replaces the first (one entry per planned meal) and undo restores it', async () => {
    const first = await logPlannedMeal(day.date, lunch, recipe, { type: 'as_planned' });
    const second = await logPlannedMeal(day.date, lunch, recipe, { type: 'portion', multiplier: 0.5 });
    expect(second.entry.id).toBe(first.entry.id);
    let rows = await entriesForDate(day.date);
    expect(rows).toHaveLength(1);
    expect(rows[0].totals.kcal).toBe(lunch.kcal / 2);
    await restoreEntry(second.entry.id, second.previous);
    rows = await entriesForDate(day.date);
    expect(rows[0].status).toBe('as_planned');
    await restoreEntry(first.entry.id, first.previous);
    expect(await entriesForDate(day.date)).toHaveLength(0);
  });

  it('swapped uses the bundle swap numbers; skipped counts zero', async () => {
    const swap = recipe!.swaps[0];
    const s = await logPlannedMeal(day.date, lunch, recipe, { type: 'swapped', swap });
    expect(s.entry.totals.kcal).toBe(swap.kcal);
    const k = await logPlannedMeal(day.date, lunch, recipe, { type: 'skipped' });
    expect(k.entry.items).toEqual([]);
    expect(k.entry.totals.kcal).toBe(0);
  });

  it('favorites: saved with what was eaten; recents dedupe', async () => {
    const { entry } = await logPlannedMeal(day.date, lunch, recipe, { type: 'portion', multiplier: 1.5 });
    expect(canSaveFavorite(entry)).toBe(true);
    const f = await saveFavoriteFromEntry(entry);
    expect(f.kcal).toBe(lunch.kcal * 1.5);
    expect(f.portion).toBe('1.5× 1 serving');
    const rec = recentItems([entry, { ...entry, id: newId() }]);
    expect(rec).toHaveLength(1);
    expect(plannedItem(lunch, recipe).source).toBe('plan');
  });
});
