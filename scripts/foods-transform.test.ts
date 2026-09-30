import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS build script
import { disambiguate, displayName, formatAmount, portionLabel, portions } from './foods-transform.mjs';

const p = (amount: number, modifier: string, gramWeight: number, sequenceNumber: number) => ({
  amount, modifier, gramWeight, sequenceNumber, measureUnit: { name: 'undetermined' },
});

describe('displayName', () => {
  it.each([
    ['Cheese, cheddar', 'Cheddar cheese'],
    ['Cheese, cheddar, reduced fat (Includes foods for USDA\'s Food Distribution Program)', 'Cheddar cheese, reduced fat'],
    ['Chicken, broilers or fryers, breast, meat only, cooked, roasted', 'Chicken breast, no skin, cooked, roasted'],
    ['Beef, ground, 90% lean meat / 10% fat, raw', 'Ground beef, 90% lean meat / 10% fat, raw'],
    ['Nuts, almonds', 'Almonds'],
    ['Beverages, carbonated, cola, regular', 'Cola, regular'],
    ['Apples, raw, with skin', 'Apples, raw, with skin'],
    ['Bananas, raw', 'Bananas, raw'],
  ])('%s → %s', (input, expected) => {
    expect(displayName(input)).toBe(expected);
  });

  it('keeps names to about 60 characters', () => {
    const long = 'Beef, loin, top sirloin cap steak, boneless, separable lean only, trimmed to 1/8" fat, choice, cooked, grilled';
    expect(displayName(long).length).toBeLessThanOrEqual(60);
  });
});

describe('portions', () => {
  it('formats amounts and cleans spacing', () => {
    expect(formatAmount(0.5)).toBe('½');
    expect(portionLabel(p(3, 'oz ( 1serving )', 85, 1))).toBe('3 oz (1 serving)');
  });

  it('puts the most natural household unit first and always offers 1 oz', () => {
    const food = { foodPortions: [p(1, 'cup, chopped', 150, 1), p(1, 'medium', 120, 2), p(1, 'lb', 453.6, 3)] };
    const list = portions(food, 'Vegetables and Vegetable Products', 40);
    expect(list[0][0]).toBe('1 medium');
    expect(list.map((x: [string, number]) => x[0])).toContain('1 oz');
    expect(list.at(-2)[0]).toBe('1 lb');
  });

  it('prefers tablespoons for fats and oils', () => {
    const food = { foodPortions: [p(1, 'cup', 216, 1), p(1, 'tbsp', 13.5, 2)] };
    expect(portions(food, 'Fats and Oils', 884)[0][0]).toBe('1 tbsp');
  });
});

describe('disambiguate', () => {
  it('lengthens colliding display names until every one is unique', () => {
    const names = [
      'Fast foods, submarine sandwich, ham on white bread with lettuce and tomato',
      'Fast foods, submarine sandwich, tuna on white bread with lettuce and tomato',
      'Beef, brisket, flat half, separable lean only, trimmed to 0" fat, all grades, raw',
      'Beef, brisket, flat half, separable lean only, trimmed to 1/8" fat, all grades, raw',
    ];
    const rows = names.map((n, i) => [i, displayName(n), n]);
    disambiguate(rows);
    expect(new Set(rows.map((r) => r[1])).size).toBe(4);
    expect(rows[0][1]).toMatch(/ham/);
  });
});
