import { describe, expect, it } from 'vitest';
import sample from './sample-bundle.json';
import { parseAndValidate, validateBundle } from './validate';

const clone = () => structuredClone(sample) as any;

describe('validateBundle', () => {
  it('accepts the sample bundle with no errors or warnings', () => {
    const r = validateBundle(clone());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.bundle!.days).toHaveLength(7);
  });

  it('rejects a meal pointing at a missing recipe', () => {
    const b = clone();
    b.days[0].meals[1].recipe_id = 'nope';
    const r = validateBundle(b);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/Day 2026-09-27, lunch: recipe "nope" isn't in the recipe list/);
  });

  it('rejects grocery and prep references to missing recipes', () => {
    const b = clone();
    b.grocery[0].recipe_ids = ['ghost'];
    b.prep[0].tasks[0].recipe_id = 'ghost2';
    const r = validateBundle(b);
    expect(r.errors.some((e) => e.includes('"ghost"'))).toBe(true);
    expect(r.errors.some((e) => e.includes('"ghost2"'))).toBe(true);
  });

  it('rejects unknown day types, sections, reminder types', () => {
    const b = clone();
    b.days[0].day_type = 'rest';
    b.grocery[0].section = 'Deli';
    b.recipes[0].ingredients[0].section = 'Meat';
    b.reminders[0].type = 'alarm';
    const r = validateBundle(b);
    expect(r.errors).toHaveLength(4);
  });

  it('rejects bad dates, out-of-range dates and bad times', () => {
    const b = clone();
    b.days[0].meals[0].time = '7:00';
    b.reminders[0].date = '2026-10-09';
    b.prep[0].date = '2026-02-30';
    b.days[1].meals[0].time = '6:30 PM';
    const r = validateBundle(b);
    expect(r.errors.join('\n')).toMatch(/24-hour/);
    expect(r.errors.join('\n')).toMatch(/outside the plan's dates/);
    expect(r.errors.join('\n')).toMatch(/isn't a real date/);
    expect(r.errors).toHaveLength(4);
  });

  it('rejects negative numbers and inverted ranges', () => {
    const b = clone();
    b.days[0].meals[0].kcal = -5;
    b.targets.day_types.hard.carbs_g = [290, 250];
    const r = validateBundle(b);
    expect(r.errors).toHaveLength(2);
  });

  it('rejects a variant not defined on the recipe', () => {
    const b = clone();
    b.days[0].meals[0].variant = 'recovery';
    expect(validateBundle(b).errors[0]).toMatch(/variant "recovery" doesn't exist/);
  });

  it('rejects duplicate dates and duplicate recipe ids', () => {
    const b = clone();
    b.days[1].date = '2026-09-27';
    b.recipes[1].id = 'ip-salsa-chicken';
    const r = validateBundle(b);
    expect(r.errors.some((e) => e.includes('more than once'))).toBe(true);
    expect(r.errors.some((e) => e.includes('more than one recipe'))).toBe(true);
  });

  it('warns but accepts unknown fields', () => {
    const b = clone();
    b.extra = 1;
    b.recipes[0].difficulty = 'easy';
    const r = validateBundle(b);
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(2);
  });

  it('rejects a missing portion guide entry and unsupported version', () => {
    const b = clone();
    delete b.targets.portion_guide.thumb_fat;
    b.data_version = '2.0';
    const r = validateBundle(b);
    expect(r.errors).toHaveLength(2);
  });

  it('rejects a backup or non-plan file', () => {
    expect(validateBundle({ bundle_type: 'fuel_backup' }).ok).toBe(false);
    expect(validateBundle([]).ok).toBe(false);
  });
});

describe('parseAndValidate', () => {
  it('explains invalid JSON', () => {
    const r = parseAndValidate('{ "bundle_type": ');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/isn't valid JSON/);
  });

  it('accepts JSON wrapped in a code fence', () => {
    const r = parseAndValidate('```json\n' + JSON.stringify(sample) + '\n```');
    expect(r.ok).toBe(true);
  });
});
