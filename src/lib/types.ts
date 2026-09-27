// Plan bundle types. These mirror the schema in SPEC.md exactly.
// The app displays these values as given; nothing here is ever recomputed.

export type Range = [number, number];

export interface Macros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface DayTypeTarget {
  label: string;
  kcal: number;
  protein_g: number;
  carbs_g: Range;
  fat_g: Range;
  fiber_g: number;
}

export const PORTION_KEYS = ['palm_protein', 'fist_veg', 'cupped_hand_carb', 'thumb_fat'] as const;
export type PortionKey = (typeof PORTION_KEYS)[number];

export interface Targets {
  day_types: Record<string, DayTypeTarget>;
  hydration_oz: { base: Range; training_add: Range };
  portion_guide: Record<PortionKey, Macros>;
}

export interface PlannedMeal extends Macros {
  slot: string;
  time: string; // HH:MM, 24-hour
  recipe_id: string;
  variant: string | null;
  servings: number;
  son_plate: string | null;
  notes: string;
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  day_type: string;
  training: boolean;
  meals: PlannedMeal[];
}

export interface Ingredient {
  item: string;
  qty: number | null;
  unit: string;
  section: GrocerySection;
}

export interface Step {
  text: string;
  timer_sec: number | null;
}

export interface Variant extends Macros {
  id: string;
  label: string;
  changes: string;
}

export interface Swap extends Macros {
  label: string;
}

export interface Recipe {
  id: string;
  name: string;
  tags: string[];
  yield_servings: number;
  active_min: number;
  total_min: number;
  ingredients: Ingredient[];
  steps: Step[];
  variants: Variant[];
  per_serving: Macros;
  portion_notes: { me: string | null; son: string | null };
  swaps: Swap[];
  storage: string;
}

export const GROCERY_SECTIONS = [
  'Produce',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Frozen',
  'Pantry',
  'Bakery',
  'Supplements',
  'Other',
] as const;
export type GrocerySection = (typeof GROCERY_SECTIONS)[number];

export interface GroceryItem {
  item: string;
  qty: number | null;
  unit: string;
  section: GrocerySection;
  recipe_ids: string[];
  optional: boolean;
  note: string;
}

export interface PrepTask {
  text: string;
  recipe_id: string | null;
  active_min: number;
  keeps: string;
}

export interface PrepSession {
  date: string;
  time: string;
  title: string;
  tasks: PrepTask[];
}

export const REMINDER_TYPES = ['thaw', 'prep', 'shop', 'supplement', 'hydrate', 'other'] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export interface Reminder {
  date: string;
  time: string;
  type: ReminderType;
  title: string;
  body: string;
}

export interface PlanBundle {
  bundle_type: 'nutrition_plan';
  data_version: string;
  plan_id: string;
  valid_from: string;
  valid_to: string;
  targets: Targets;
  days: PlanDay[];
  recipes: Recipe[];
  grocery: GroceryItem[];
  prep: PrepSession[];
  reminders: Reminder[];
  notes: string;
}

/** A bundle as stored on-device. Every import is kept; the newest is the active plan. */
export interface StoredBundle {
  id?: number;
  plan_id: string;
  data_version: string;
  valid_from: string;
  valid_to: string;
  imported_at: string; // ISO timestamp
  bundle: PlanBundle;
}
