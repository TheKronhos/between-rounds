import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildIndex, decode, expandQuery, foodItem, nutritionFor, searchFoods, type FoodTableFile } from './foodTable';
import { computeTotals } from './log';

const file = JSON.parse(readFileSync(new URL('../../public/foods.json', import.meta.url), 'utf8')) as FoodTableFile;
const foods = decode(file);
const index = buildIndex(foods);
const top = (q: string, n = 5) => searchFoods(index, q, n).map((f) => f.name);

describe('food table contents', () => {
  it('has no baby foods and every food has portions', () => {
    expect(foods.length).toBeGreaterThan(7000);
    expect(foods.some((f) => f.category === 'Baby Foods' || /^babyfood/i.test(f.name))).toBe(false);
    expect(foods.every((f) => f.portions.length > 0)).toBe(true);
  });
});

describe('search', () => {
  it('is word-order independent: "cheddar cheese" finds "Cheese, cheddar"', () => {
    expect(top('cheddar cheese')[0]).toMatch(/^Cheese, cheddar/);
    expect(top('cheese cheddar')[0]).toBe(top('cheddar cheese')[0]);
  });

  it('tolerates typos and plurals', () => {
    expect(top('chedar chese')[0]).toMatch(/^Cheese, cheddar/);
    expect(top('banana', 3)).toContain('Bananas, raw');
    expect(top('bananas', 3)).toContain('Bananas, raw');
  });

  it('understands common US names', () => {
    expect(top('fries').some((n) => /french fried/i.test(n))).toBe(true);
    expect(top('soda').some((n) => /carbonated/i.test(n))).toBe(true);
    expect(top('pop').some((n) => /carbonated/i.test(n))).toBe(true);
    expect(top('hoagie').some((n) => /submarine sandwich/i.test(n))).toBe(true);
    expect(top('chips').some((n) => /potato chips/i.test(n))).toBe(true);
    expect(top('hot dog').some((n) => /frankfurter/i.test(n))).toBe(true);
    expect(top('mac and cheese').some((n) => /macaroni and cheese/i.test(n))).toBe(true);
  });

  it('expands multi-word synonyms only on whole words', () => {
    expect(expandQuery('hot dog')).toContain('frankfurter');
    expect(expandQuery('popcorn')).toEqual(['popcorn']);
  });

  it('finds everyday foods near the top', () => {
    expect(top('egg')).toContain('Egg, whole, raw, fresh');
    expect(top('chicken breast').some((n) => /^Chicken, broilers or fryers, breast/.test(n))).toBe(true);
    expect(top('peanut butter')[0]).toMatch(/^Peanut butter/);
    expect(top('whole milk').some((n) => /^Milk, whole/.test(n))).toBe(true);
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
    expect(it.kcal).toBe(Math.round(pb.per100.kcal * 0.4));
  });
});
