// Strict plan-bundle validation. Any error rejects the whole bundle.
// Unknown fields produce warnings only. Messages are plain English for a non-programmer.
//
// Fields that are nullable or free text in the schema (variant, son_plate, notes, body,
// storage, swaps, variants, etc.) may be omitted and default to null / "" / [].
// Everything else is required.

import {
  GROCERY_SECTIONS,
  PORTION_KEYS,
  REMINDER_TYPES,
  type PlanBundle,
} from './types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  bundle?: PlanBundle; // normalized copy, only when ok
}

type Obj = Record<string, unknown>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24 = /^([01]\d|2[0-3]):[0-5]\d$/;
const SUPPORTED_MAJOR = '1';

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

class Checker {
  errors: string[] = [];
  warnings: string[] = [];

  err(msg: string) {
    this.errors.push(msg);
  }

  unknown(o: Obj, known: readonly string[], where: string) {
    for (const k of Object.keys(o)) {
      if (!known.includes(k)) this.warnings.push(`${where}: unknown field "${k}" was ignored.`);
    }
  }

  obj(parent: Obj, key: string, where: string): Obj | undefined {
    const v = parent[key];
    if (v === undefined) return void this.err(`${where}: "${key}" is missing.`);
    if (!isObj(v)) return void this.err(`${where}: "${key}" should be an object.`);
    return v;
  }

  arr(parent: Obj, key: string, where: string, optional = false): unknown[] | undefined {
    const v = parent[key];
    if (v === undefined || (optional && v === null)) {
      if (optional) return [];
      return void this.err(`${where}: "${key}" is missing.`);
    }
    if (!Array.isArray(v)) return void this.err(`${where}: "${key}" should be a list.`);
    return v;
  }

  str(parent: Obj, key: string, where: string, opts: { optional?: boolean; nonEmpty?: boolean } = {}): string | undefined {
    const v = parent[key];
    if (v === undefined || v === null) {
      if (opts.optional) return '';
      return void this.err(`${where}: "${key}" is missing.`);
    }
    if (typeof v !== 'string') return void this.err(`${where}: "${key}" should be text.`);
    if (opts.nonEmpty && v.trim() === '') return void this.err(`${where}: "${key}" is empty.`);
    return v;
  }

  nullableStr(parent: Obj, key: string, where: string): string | null | undefined {
    const v = parent[key];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') return void this.err(`${where}: "${key}" should be text or null.`);
    return v;
  }

  num(parent: Obj, key: string, where: string, opts: { nullable?: boolean } = {}): number | null | undefined {
    const v = parent[key];
    if (v === undefined || v === null) {
      if (opts.nullable) return null;
      return void this.err(`${where}: "${key}" is missing.`);
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) return void this.err(`${where}: "${key}" should be a number.`);
    if (v < 0) return void this.err(`${where}: "${key}" is ${v}; numbers can't be negative.`);
    return v;
  }

  bool(parent: Obj, key: string, where: string, fallback?: boolean): boolean | undefined {
    const v = parent[key];
    if (v === undefined && fallback !== undefined) return fallback;
    if (typeof v !== 'boolean') return void this.err(`${where}: "${key}" should be true or false.`);
    return v;
  }

  range(parent: Obj, key: string, where: string): [number, number] | undefined {
    const v = parent[key];
    if (v === undefined) return void this.err(`${where}: "${key}" is missing.`);
    if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return void this.err(`${where}: "${key}" should be a [low, high] pair of numbers.`);
    }
    const [lo, hi] = v as number[];
    if (lo < 0 || hi < 0) return void this.err(`${where}: "${key}" has a negative number.`);
    if (lo > hi) return void this.err(`${where}: "${key}" low value ${lo} is higher than the high value ${hi}.`);
    return [lo, hi];
  }

  date(parent: Obj, key: string, where: string): string | undefined {
    const v = this.str(parent, key, where);
    if (v === undefined) return;
    if (!isValidIsoDate(v)) return void this.err(`${where}: "${key}" is "${v}", which isn't a real date in YYYY-MM-DD form.`);
    return v;
  }

  time(parent: Obj, key: string, where: string): string | undefined {
    const v = this.str(parent, key, where);
    if (v === undefined) return;
    if (!TIME_24.test(v)) return void this.err(`${where}: "${key}" is "${v}"; times must be 24-hour HH:MM (e.g. 07:30, 18:00).`);
    return v;
  }

  macros(o: Obj, where: string) {
    return {
      kcal: this.num(o, 'kcal', where) as number,
      protein_g: this.num(o, 'protein_g', where) as number,
      carbs_g: this.num(o, 'carbs_g', where) as number,
      fat_g: this.num(o, 'fat_g', where) as number,
    };
  }
}

const MACRO_KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g'] as const;

export function validateBundle(input: unknown): ValidationResult {
  const c = new Checker();

  if (!isObj(input)) {
    return { ok: false, errors: ['The file isn\'t a plan bundle (expected a JSON object at the top level).'], warnings: [] };
  }
  const root = input;
  const T = 'Plan';

  c.unknown(root, ['bundle_type', 'data_version', 'plan_id', 'valid_from', 'valid_to', 'targets', 'days', 'recipes', 'grocery', 'prep', 'reminders', 'notes'], T);

  if (root.bundle_type !== 'nutrition_plan') {
    c.err(`${T}: "bundle_type" must be "nutrition_plan" (got ${JSON.stringify(root.bundle_type)}). This may be a backup file or check-in, not a plan.`);
  }
  const data_version = c.str(root, 'data_version', T);
  if (data_version !== undefined) {
    if (data_version.split('.')[0] !== SUPPORTED_MAJOR) {
      c.err(`${T}: data_version "${data_version}" isn't supported. This app reads version 1.x bundles.`);
    } else if (data_version !== '1.0') {
      c.warnings.push(`${T}: data_version is "${data_version}"; this app was built for 1.0. Newer fields will be ignored.`);
    }
  }
  const plan_id = c.str(root, 'plan_id', T, { nonEmpty: true });
  const valid_from = c.date(root, 'valid_from', T);
  const valid_to = c.date(root, 'valid_to', T);
  const rangeOk = valid_from !== undefined && valid_to !== undefined;
  if (rangeOk && valid_from > valid_to) {
    c.err(`${T}: valid_from (${valid_from}) is after valid_to (${valid_to}).`);
  }
  const inRange = (d: string | undefined, where: string) => {
    if (d === undefined || !rangeOk) return;
    if (d < valid_from || d > valid_to) {
      c.err(`${where}: date ${d} is outside the plan's dates (${valid_from} to ${valid_to}).`);
    }
  };
  const notes = c.str(root, 'notes', T, { optional: true });

  // ---- targets ----
  const dayTypeIds = new Set<string>();
  const targetsRaw = c.obj(root, 'targets', T);
  let targets: PlanBundle['targets'] | undefined;
  if (targetsRaw) {
    const W = 'Targets';
    c.unknown(targetsRaw, ['day_types', 'hydration_oz', 'portion_guide'], W);
    const dt = c.obj(targetsRaw, 'day_types', W);
    const day_types: PlanBundle['targets']['day_types'] = {};
    if (dt) {
      if (Object.keys(dt).length === 0) c.err(`${W}: "day_types" has no day types.`);
      for (const [id, raw] of Object.entries(dt)) {
        const w = `Day type "${id}"`;
        if (!isObj(raw)) {
          c.err(`${w}: should be an object.`);
          continue;
        }
        dayTypeIds.add(id);
        c.unknown(raw, ['label', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'], w);
        day_types[id] = {
          label: c.str(raw, 'label', w, { nonEmpty: true }) as string,
          kcal: c.num(raw, 'kcal', w) as number,
          protein_g: c.num(raw, 'protein_g', w) as number,
          carbs_g: c.range(raw, 'carbs_g', w)!,
          fat_g: c.range(raw, 'fat_g', w)!,
          fiber_g: c.num(raw, 'fiber_g', w) as number,
        };
      }
    }
    const hy = c.obj(targetsRaw, 'hydration_oz', W);
    let hydration_oz: PlanBundle['targets']['hydration_oz'] | undefined;
    if (hy) {
      const w = 'Hydration target';
      c.unknown(hy, ['base', 'training_add'], w);
      hydration_oz = { base: c.range(hy, 'base', w)!, training_add: c.range(hy, 'training_add', w)! };
    }
    const pg = c.obj(targetsRaw, 'portion_guide', W);
    const portion_guide = {} as PlanBundle['targets']['portion_guide'];
    if (pg) {
      c.unknown(pg, PORTION_KEYS, 'Portion guide');
      for (const k of PORTION_KEYS) {
        const v = c.obj(pg, k, 'Portion guide');
        if (v) {
          c.unknown(v, MACRO_KEYS, `Portion guide "${k}"`);
          portion_guide[k] = c.macros(v, `Portion guide "${k}"`);
        }
      }
    }
    targets = { day_types, hydration_oz: hydration_oz!, portion_guide };
  }

  // ---- recipes (first, so other sections can cross-reference) ----
  const recipeVariants = new Map<string, Set<string>>();
  const recipesRaw = c.arr(root, 'recipes', T) ?? [];
  const recipes: PlanBundle['recipes'] = [];
  recipesRaw.forEach((raw, i) => {
    let w = `Recipe #${i + 1}`;
    if (!isObj(raw)) return c.err(`${w}: should be an object.`);
    const id = c.str(raw, 'id', w, { nonEmpty: true });
    const name = c.str(raw, 'name', w, { nonEmpty: true });
    if (name) w = `Recipe "${name}"`;
    c.unknown(raw, ['id', 'name', 'tags', 'yield_servings', 'active_min', 'total_min', 'ingredients', 'steps', 'variants', 'per_serving', 'portion_notes', 'swaps', 'storage'], w);
    if (id !== undefined) {
      if (recipeVariants.has(id)) c.err(`${w}: the id "${id}" is used by more than one recipe.`);
      recipeVariants.set(id, new Set());
    }

    const tags = (c.arr(raw, 'tags', w, true) ?? []).filter((t, j) => {
      if (typeof t !== 'string') {
        c.err(`${w}: tag #${j + 1} should be text.`);
        return false;
      }
      return true;
    }) as string[];

    const ingredients = (c.arr(raw, 'ingredients', w) ?? []).map((ing, j) => {
      const wi = `${w}, ingredient #${j + 1}`;
      if (!isObj(ing)) return void c.err(`${wi}: should be an object.`);
      c.unknown(ing, ['item', 'qty', 'unit', 'section'], wi);
      return {
        item: c.str(ing, 'item', wi, { nonEmpty: true }) as string,
        qty: c.num(ing, 'qty', wi, { nullable: true }) as number | null,
        unit: c.str(ing, 'unit', wi, { optional: true }) as string,
        section: checkSection(c, ing, wi),
      };
    });

    const stepsRaw = c.arr(raw, 'steps', w) ?? [];
    if (stepsRaw.length === 0 && Array.isArray(raw.steps)) c.warnings.push(`${w}: has no steps.`);
    const steps = stepsRaw.map((st, j) => {
      const ws = `${w}, step ${j + 1}`;
      if (!isObj(st)) return void c.err(`${ws}: should be an object.`);
      c.unknown(st, ['text', 'timer_sec'], ws);
      return {
        text: c.str(st, 'text', ws, { nonEmpty: true }) as string,
        timer_sec: c.num(st, 'timer_sec', ws, { nullable: true }) as number | null,
      };
    });

    const variants = (c.arr(raw, 'variants', w, true) ?? []).map((v, j) => {
      const wv = `${w}, variant #${j + 1}`;
      if (!isObj(v)) return void c.err(`${wv}: should be an object.`);
      c.unknown(v, ['id', 'label', 'changes', ...MACRO_KEYS], wv);
      const vid = c.str(v, 'id', wv, { nonEmpty: true });
      if (vid !== undefined && id !== undefined) {
        const set = recipeVariants.get(id)!;
        if (set.has(vid)) c.err(`${wv}: variant id "${vid}" is used twice in this recipe.`);
        set.add(vid);
      }
      return {
        id: vid as string,
        label: c.str(v, 'label', wv, { nonEmpty: true }) as string,
        changes: c.str(v, 'changes', wv, { optional: true }) as string,
        ...c.macros(v, wv),
      };
    });

    const psRaw = c.obj(raw, 'per_serving', w);
    if (psRaw) c.unknown(psRaw, MACRO_KEYS, `${w}, per_serving`);
    const per_serving = psRaw ? c.macros(psRaw, `${w}, per_serving`) : (undefined as never);

    let portion_notes = { me: null as string | null, son: null as string | null };
    if (raw.portion_notes !== undefined && raw.portion_notes !== null) {
      if (!isObj(raw.portion_notes)) c.err(`${w}: "portion_notes" should be an object with "me" and "son".`);
      else {
        c.unknown(raw.portion_notes, ['me', 'son'], `${w}, portion_notes`);
        portion_notes = {
          me: c.nullableStr(raw.portion_notes, 'me', `${w}, portion_notes`) ?? null,
          son: c.nullableStr(raw.portion_notes, 'son', `${w}, portion_notes`) ?? null,
        };
      }
    }

    const swaps = (c.arr(raw, 'swaps', w, true) ?? []).map((s, j) => {
      const wsw = `${w}, swap #${j + 1}`;
      if (!isObj(s)) return void c.err(`${wsw}: should be an object.`);
      c.unknown(s, ['label', ...MACRO_KEYS], wsw);
      return { label: c.str(s, 'label', wsw, { nonEmpty: true }) as string, ...c.macros(s, wsw) };
    });

    recipes.push({
      id: id as string,
      name: name as string,
      tags,
      yield_servings: c.num(raw, 'yield_servings', w) as number,
      active_min: c.num(raw, 'active_min', w) as number,
      total_min: c.num(raw, 'total_min', w) as number,
      ingredients: ingredients as PlanBundle['recipes'][number]['ingredients'],
      steps: steps as PlanBundle['recipes'][number]['steps'],
      variants: variants as PlanBundle['recipes'][number]['variants'],
      per_serving,
      portion_notes,
      swaps: swaps as PlanBundle['recipes'][number]['swaps'],
      storage: c.str(raw, 'storage', w, { optional: true }) as string,
    });
  });

  const recipeRef = (rid: string | undefined, where: string) => {
    if (rid === undefined) return;
    if (!recipeVariants.has(rid)) c.err(`${where}: recipe "${rid}" isn't in the recipe list.`);
  };

  // ---- days ----
  const seenDates = new Set<string>();
  const days = (c.arr(root, 'days', T) ?? []).map((raw, i) => {
    let w = `Day #${i + 1}`;
    if (!isObj(raw)) return void c.err(`${w}: should be an object.`);
    const date = c.date(raw, 'date', w);
    if (date) {
      w = `Day ${date}`;
      if (seenDates.has(date)) c.err(`${w}: this date appears more than once in "days".`);
      seenDates.add(date);
    }
    c.unknown(raw, ['date', 'day_type', 'training', 'meals'], w);
    inRange(date, w);
    const day_type = c.str(raw, 'day_type', w, { nonEmpty: true });
    if (day_type !== undefined && targetsRaw && !dayTypeIds.has(day_type)) {
      c.err(`${w}: day type "${day_type}" isn't defined in targets (defined: ${[...dayTypeIds].join(', ') || 'none'}).`);
    }
    const slots = new Set<string>();
    const meals = (c.arr(raw, 'meals', w) ?? []).map((m, j) => {
      let wm = `${w}, meal #${j + 1}`;
      if (!isObj(m)) return void c.err(`${wm}: should be an object.`);
      const slot = c.str(m, 'slot', wm, { nonEmpty: true });
      if (slot) {
        wm = `${w}, ${slot}`;
        // Log entries point at a planned meal by date + slot, so slots must be unique per day.
        if (slots.has(slot)) c.err(`${w}: the slot "${slot}" is used by more than one meal. Give each meal on a day its own slot name (e.g. "snack-1", "snack-2").`);
        slots.add(slot);
      }
      c.unknown(m, ['slot', 'time', 'recipe_id', 'variant', 'servings', ...MACRO_KEYS, 'son_plate', 'notes'], wm);
      const recipe_id = c.str(m, 'recipe_id', wm, { nonEmpty: true });
      recipeRef(recipe_id, wm);
      const variant = c.nullableStr(m, 'variant', wm);
      if (variant && recipe_id && recipeVariants.has(recipe_id) && !recipeVariants.get(recipe_id)!.has(variant)) {
        c.err(`${wm}: variant "${variant}" doesn't exist on recipe "${recipe_id}".`);
      }
      return {
        slot: slot as string,
        time: c.time(m, 'time', wm) as string,
        recipe_id: recipe_id as string,
        variant: variant ?? null,
        servings: c.num(m, 'servings', wm) as number,
        ...c.macros(m, wm),
        son_plate: c.nullableStr(m, 'son_plate', wm) ?? null,
        notes: c.str(m, 'notes', wm, { optional: true }) as string,
      };
    });
    return {
      date: date as string,
      day_type: day_type as string,
      training: c.bool(raw, 'training', w) as boolean,
      meals: meals as PlanBundle['days'][number]['meals'],
    };
  });
  if (rangeOk && seenDates.size > 0) {
    const missing = datesBetween(valid_from, valid_to).filter((d) => !seenDates.has(d));
    if (missing.length) c.warnings.push(`Plan has no day entry for: ${missing.join(', ')}.`);
  }

  // ---- grocery ----
  const grocery = (c.arr(root, 'grocery', T) ?? []).map((raw, i) => {
    let w = `Grocery item #${i + 1}`;
    if (!isObj(raw)) return void c.err(`${w}: should be an object.`);
    const item = c.str(raw, 'item', w, { nonEmpty: true });
    if (item) w = `Grocery item "${item}"`;
    c.unknown(raw, ['item', 'qty', 'unit', 'section', 'recipe_ids', 'optional', 'note'], w);
    const recipe_ids = (c.arr(raw, 'recipe_ids', w, true) ?? []).filter((r) => {
      if (typeof r !== 'string') {
        c.err(`${w}: every entry in "recipe_ids" should be text.`);
        return false;
      }
      recipeRef(r, w);
      return true;
    }) as string[];
    return {
      item: item as string,
      qty: c.num(raw, 'qty', w, { nullable: true }) as number | null,
      unit: c.str(raw, 'unit', w, { optional: true }) as string,
      section: checkSection(c, raw, w),
      recipe_ids,
      optional: c.bool(raw, 'optional', w, false) as boolean,
      note: c.str(raw, 'note', w, { optional: true }) as string,
    };
  });

  // ---- prep ----
  const prep = (c.arr(root, 'prep', T, true) ?? []).map((raw, i) => {
    let w = `Prep session #${i + 1}`;
    if (!isObj(raw)) return void c.err(`${w}: should be an object.`);
    const title = c.str(raw, 'title', w, { nonEmpty: true });
    if (title) w = `Prep session "${title}"`;
    c.unknown(raw, ['date', 'time', 'title', 'tasks'], w);
    const date = c.date(raw, 'date', w);
    inRange(date, w);
    const tasks = (c.arr(raw, 'tasks', w) ?? []).map((t, j) => {
      const wt = `${w}, task #${j + 1}`;
      if (!isObj(t)) return void c.err(`${wt}: should be an object.`);
      c.unknown(t, ['text', 'recipe_id', 'active_min', 'keeps'], wt);
      const recipe_id = c.nullableStr(t, 'recipe_id', wt);
      if (recipe_id) recipeRef(recipe_id, wt);
      return {
        text: c.str(t, 'text', wt, { nonEmpty: true }) as string,
        recipe_id: recipe_id ?? null,
        active_min: c.num(t, 'active_min', wt) as number,
        keeps: c.str(t, 'keeps', wt, { optional: true }) as string,
      };
    });
    return { date: date as string, time: c.time(raw, 'time', w) as string, title: title as string, tasks: tasks as PlanBundle['prep'][number]['tasks'] };
  });

  // ---- reminders ----
  const reminders = (c.arr(root, 'reminders', T, true) ?? []).map((raw, i) => {
    let w = `Reminder #${i + 1}`;
    if (!isObj(raw)) return void c.err(`${w}: should be an object.`);
    const title = c.str(raw, 'title', w, { nonEmpty: true });
    if (title) w = `Reminder "${title}"`;
    c.unknown(raw, ['date', 'time', 'type', 'title', 'body'], w);
    const date = c.date(raw, 'date', w);
    inRange(date, w);
    const type = c.str(raw, 'type', w);
    if (type !== undefined && !(REMINDER_TYPES as readonly string[]).includes(type)) {
      c.err(`${w}: type "${type}" isn't allowed. Use one of: ${REMINDER_TYPES.join(', ')}.`);
    }
    return {
      date: date as string,
      time: c.time(raw, 'time', w) as string,
      type: type as PlanBundle['reminders'][number]['type'],
      title: title as string,
      body: c.str(raw, 'body', w, { optional: true }) as string,
    };
  });

  if (c.errors.length) return { ok: false, errors: c.errors, warnings: c.warnings };

  const bundle: PlanBundle = {
    bundle_type: 'nutrition_plan',
    data_version: data_version!,
    plan_id: plan_id!,
    valid_from: valid_from!,
    valid_to: valid_to!,
    targets: targets!,
    days: (days as PlanBundle['days']).slice().sort((a, b) => a.date.localeCompare(b.date)),
    recipes,
    grocery: grocery as PlanBundle['grocery'],
    prep: prep as PlanBundle['prep'],
    reminders: reminders as PlanBundle['reminders'],
    notes: notes ?? '',
  };
  return { ok: true, errors: [], warnings: c.warnings, bundle };
}

function checkSection(c: Checker, o: Obj, where: string) {
  const s = c.str(o, 'section', where);
  if (s !== undefined && !(GROCERY_SECTIONS as readonly string[]).includes(s)) {
    c.err(`${where}: section "${s}" isn't one of the store sections (${GROCERY_SECTIONS.join(', ')}).`);
  }
  return s as PlanBundle['grocery'][number]['section'];
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end && out.length < 366) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Parse raw text (file contents or pasted JSON) and validate. */
export function parseAndValidate(text: string): ValidationResult {
  let data: unknown;
  // Tolerate a ```json … ``` code fence around text copied from a chat.
  const cleaned = text.trim().replace(/^```[a-zA-Z]*\s*\n/, '').replace(/\n?```\s*$/, '');
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      errors: [`This isn't valid JSON, so nothing was checked. The parser said: ${msg}. Make sure you copied the whole bundle, including the first { and last }.`],
      warnings: [],
    };
  }
  return validateBundle(data);
}
