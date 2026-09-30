import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildIndex, decode, expandQuery, foodItem, nutritionFor, searchFoods, type FoodTableFile } from './foodTable';
import { computeTotals } from './log';

const file = JSON.parse(readFileSync(new URL('../../public/foods.json', import.meta.url), 'utf8')) as FoodTableFile;
const foods = decode(file);
const index = buildIndex(foods);
const top = (q: string, n = 5) => searchFoods(index, q, n).map((f) => f.name);

describe('food table contents', () => {
  it('has both datasets, no baby foods or formula, and every food has portions', () => {
    expect(foods.filter((f) => f.dataset === 'sr').length).toBeGreaterThan(7000);
    expect(foods.filter((f) => f.dataset === 'fndds').length).toBeGreaterThan(5000);
    expect(foods.some((f) => /^(baby|formula|human milk)/i.test(f.category) || /^babyfood/i.test(f.name))).toBe(false);
    expect(foods.every((f) => f.portions.length > 0)).toBe(true);
  });
});

describe('search', () => {
  it('is word-order independent: "cheddar cheese" finds "Cheese, cheddar"', () => {
    expect(top('cheddar cheese')[0]).toMatch(/^Cheese, cheddar/i);
    expect(top('cheese cheddar')[0]).toBe(top('cheddar cheese')[0]);
  });

  it('tolerates typos and plurals', () => {
    expect(top('chedar chese')[0]).toMatch(/^Cheese, cheddar/i);
    expect(top('banana', 1)[0]).toMatch(/^Bananas?, raw$/);
    expect(top('bananas', 1)[0]).toMatch(/^Bananas?, raw$/);
  });

  it('finds prepared foods from the survey dataset', () => {
    const tz = searchFoods(index, 'tzatziki', 3);
    expect(tz[0].name).toBe('Tzatziki dip');
    expect(tz[0].portions[0][0]).toBe('1 tablespoon');
    expect(foodItem(tz[0], tz[0].portions[0], 2).source_ref).toBe(`fndds:${tz[0].fdcId}`);
  });

  it('understands common US names', () => {
    expect(top('fries').some((n) => /french fr(ied|ies)/i.test(n))).toBe(true);
    expect(top('soda', 1)[0]).toMatch(/soft drink, cola|carbonated, cola/i);
    expect(top('pop', 1)[0]).toMatch(/soft drink, cola|carbonated, cola/i);
    expect(top('soda').some((n) => /\b(rum|vodka|whiskey)\b/i.test(n))).toBe(false);
    expect(top('hoagie').some((n) => /submarine sandwich/i.test(n))).toBe(true);
    expect(top('chips').some((n) => /potato chips/i.test(n))).toBe(true);
    expect(top('hot dog', 1)[0]).toMatch(/^(hot dog|frankfurter)/i);
    expect(top('mac and cheese').some((n) => /macaroni and cheese/i.test(n))).toBe(true);
  });

  it('expands multi-word synonyms only on whole words', () => {
    expect(expandQuery('hot dog')).toContain('frankfurter');
    expect(expandQuery('popcorn')).toEqual(['popcorn']);
  });

  it('finds everyday foods near the top', () => {
    expect(top('egg', 1)[0]).toMatch(/^Egg, whole/);
    expect(top('chicken breast', 1)[0]).toMatch(/^Chicken breast/i);
    expect(top('peanut butter', 1)[0]).toMatch(/^Peanut butter/);
    expect(top('whole milk', 1)[0]).toMatch(/^Milk, whole/);
    expect(top('oatmeal', 1)[0]).toMatch(/^Oatmeal/);
    expect(top('beer', 1)[0]).toMatch(/^Beer|beer/);
    expect(top('coffee', 1)[0]).toMatch(/^Coffee, brewed/);
  });

  it('ignores 1-character queries', () => {
    expect(searchFoods(index, 'a')).toEqual([]);
  });
});

describe('servings', () => {
  const pb = foods.find((f) => f.name.startsWith('Peanut butter, smooth style, with salt'))!;
  it('defaults to a household portion, not a cup of peanut butter', () => {
    expect(pb.portions[0][0]).toBe('2 tbsp');
  });
  it('an amount logs the same calories the picker previewed', () => {
    const tz = foods.find((f) => f.name === 'Tzatziki dip')!;
    const [label, grams] = tz.portions[0];
    const it = foodItem(tz, [label, grams], 2);
    expect(Math.round(computeTotals([it]).kcal)).toBe(Math.round(nutritionFor(tz, grams * 2).kcal));
  });

  it('makes an item per portion with the count as multiplier', () => {
    const it = foodItem(pb, pb.portions[0], 1.5);
    expect(it.portion).toBe('2 tbsp');
    expect(it.multiplier).toBe(1.5);
    expect(it.source).toBe('usda');
    expect(it.source_ref).toBe(`sr:${pb.fdcId}`);
    expect(computeTotals([it]).kcal).toBeCloseTo(nutritionFor(pb, pb.portions[0][1]).kcal * 1.5, 0);
  });
  it('can log by grams instead (hidden under More)', () => {
    const it = foodItem(pb, pb.portions[0], 3, 40);
    expect(it.portion).toBe('40 g');
    expect(it.multiplier).toBe(1);
    expect(it.kcal).toBeCloseTo(pb.per100.kcal * 0.4, 0);
  });
});
