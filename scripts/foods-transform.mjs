// Pure helpers that turn USDA FoodData Central SR Legacy records into the compact
// offline food table (public/foods.json). Used by scripts/build-foods.mjs; unit-tested.

// SR Legacy "Baby Foods"; FNDDS "Baby food: …", "Baby juice", "Baby water", "Formula, …", "Human milk".
const EXCLUDED = /^(baby foods?\b|baby (juice|water)$|formula, |human milk$|infant formula)/i;
export const isExcludedCategory = (category) => EXCLUDED.test(category ?? '');

/** SR Legacy has foodCategory; FNDDS (survey foods) has a WWEIA category. */
export const categoryOf = (food) =>
  food.foodCategory?.description ?? food.wweiaFoodCategory?.wweiaFoodCategoryDescription ?? 'Other';

/** Dataset codes stored in each row and used in log items' source_ref ("sr:<fdcId>", "fndds:<fdcId>"). */
export const DATASETS = ['sr', 'fndds'];

const NUTRIENT = { kcal: '208', protein: '203', fat: '204', carbs: '205', fiber: '291' };

const round1 = (n) => Math.round(n * 10) / 10;

export function nutrientsPer100g(food) {
  const by = new Map(food.foodNutrients.map((n) => [n.nutrient.number, n.amount]));
  const get = (k) => (by.has(NUTRIENT[k]) && typeof by.get(NUTRIENT[k]) === 'number' ? by.get(NUTRIENT[k]) : null);
  return {
    kcal: Math.round(get('kcal') ?? 0),
    protein_g: round1(get('protein') ?? 0),
    carbs_g: round1(get('carbs') ?? 0),
    fat_g: round1(get('fat') ?? 0),
    fiber_g: get('fiber') === null ? null : round1(get('fiber')),
  };
}

// ---------- display names ----------

// Parts that make USDA names long without helping someone pick a food.
const NOISE = [
  /^broilers or fryers$/i,
  /^mixed species$/i,
  /^all (commercial )?varieties$/i,
  /^year round average$/i,
  /^(usda )?(select|choice|prime)$/i,
  /^usda commodity.*$/i,
  /^includes .*$/i,
  /^regular pack$/i,
  /^NFS$/,
  /^NS as to .*$/i,
  /^trimmed to .*fat$/i,
  /^imported$/i,
  /^domestic$/i,
];

const SHORTEN = [
  [/^separable lean and fat$/i, 'lean and fat'],
  [/^separable lean only$/i, 'lean only'],
  [/^meat and skin$/i, 'with skin'],
  [/^meat only$/i, 'no skin'],
];

// "Cheese, cheddar" → "Cheddar cheese": base nouns that read naturally after their variety.
const VARIETY_FIRST = new Set([
  'cheese', 'bread', 'beans', 'oil', 'milk', 'tea', 'crackers', 'cookies', 'rice', 'sauce', 'soup',
  'yogurt', 'muffins', 'pie', 'cake', 'rolls', 'bagels', 'pasta', 'noodles', 'peppers', 'squash',
  'lettuce', 'cabbage', 'onions', 'potatoes', 'apples', 'grapes', 'melons', 'lentils', 'peas',
  'sausage', 'syrup', 'candies', 'pancakes', 'waffles', 'tortillas', 'cereal', 'frankfurter',
  'salad dressing', 'mustard', 'vinegar', 'flour', 'sugar', 'pretzels', 'popcorn', 'chips',
]);

// "Nuts, almonds" → "Almonds": group prefixes that add nothing.
const DROP_PREFIX = new Set([
  'nuts', 'seeds', 'beverages', 'fast foods', 'restaurant', 'snacks', 'spices', 'cereals ready-to-eat',
  'cereals', 'alcoholic beverage', 'fish', 'crustaceans', 'mollusks', 'game meat', 'luncheon meat',
  'carbonated',
]);

// "Chicken, breast" → "Chicken breast"
const MEATS = new Set(['chicken', 'turkey', 'beef', 'pork', 'lamb', 'veal', 'duck', 'ham']);
const CUTS = new Set(['breast', 'thigh', 'drumstick', 'wing', 'leg', 'back', 'ground', 'liver', 'bacon', 'loin', 'tenderloin', 'ribs', 'brisket', 'chuck', 'sirloin']);

const PREP = /\b(raw|cooked|boiled|baked|roasted|fried|broiled|braised|grilled|steamed|stewed|frozen|canned|dried|dry|prepared|unprepared|microwaved|drained|with|without|salt|unsalted|regular|reduced|low|fat|lean)\b/i;

const lower = (s) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function displayName(description, maxLen = 60) {
  let parts = description
    .replace(/\s*\((includes|formerly|made with|also called)[^)]*\)/gi, '')
    .replace(/\s+\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .split(/,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  parts = parts.filter((p) => !NOISE.some((re) => re.test(p)));
  parts = parts.map((p) => SHORTEN.reduce((s, [re, r]) => s.replace(re, r), p));

  while (parts.length > 1 && DROP_PREFIX.has(parts[0].toLowerCase())) parts = parts.slice(1);

  if (parts.length > 1) {
    const base = parts[0].toLowerCase();
    const second = parts[1];
    const shortModifier = second.split(' ').length <= 3 && !/\d/.test(second) && !PREP.test(second);
    if (MEATS.has(base) && CUTS.has(second.toLowerCase())) {
      parts = [second.toLowerCase() === 'ground' ? `Ground ${base}` : `${parts[0]} ${second.toLowerCase()}`, ...parts.slice(2)];
    } else if (VARIETY_FIRST.has(base) && shortModifier) {
      parts = [`${upperFirst(second)} ${lower(parts[0])}`, ...parts.slice(2)];
    }
  }

  // Keep it short: first part plus as many descriptors as fit.
  let out = upperFirst(parts[0]);
  for (const p of parts.slice(1)) {
    if ((out + ', ' + p).length > maxLen) break;
    out += ', ' + p;
  }
  return out;
}

/**
 * Different foods can shorten to the same name ("Submarine sandwich" ×11). Lengthen
 * colliding names until they differ, so every result in a list is distinguishable.
 * rows: [fdcId, display, name, ...]; mutated in place.
 */
export function disambiguate(rows) {
  for (const maxLen of [90, 140, Infinity]) {
    const groups = new Map();
    for (const r of rows) groups.set(r[1], [...(groups.get(r[1]) ?? []), r]);
    const dups = [...groups.values()].filter((g) => g.length > 1);
    if (!dups.length) return;
    for (const g of dups) for (const r of g) r[1] = maxLen === Infinity ? r[2] : displayName(r[2], maxLen);
  }
}

// ---------- household portions ----------

const FRACTIONS = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];

export function formatAmount(n) {
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.01) return String(whole);
  const hit = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.02);
  if (hit) return whole ? `${whole}${hit[1]}` : hit[1];
  return String(round1(n));
}

export function portionLabel(p) {
  // FNDDS describes portions in words; its "modifier" is an internal code, not a label.
  if (p.portionDescription) {
    if (/^quantity not specified$/i.test(p.portionDescription)) return 'Typical amount';
    return p.portionDescription.replace(/\s{2,}/g, ' ').trim();
  }
  const unit = p.measureUnit?.name && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
  const mod = (p.modifier ?? '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/(\d)serving/g, '$1 serving')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const amount = formatAmount(p.amount ?? p.value ?? 1);
  return [amount, unit, mod].filter(Boolean).join(' ');
}

// Categories eaten by the spoonful (SR Legacy and FNDDS/WWEIA names).
const SMALL_MEASURE_FIRST = new Set([
  'Fats and Oils', 'Spices and Herbs', 'Soups, Sauces, and Gravies', 'Sweets',
  'Dips, gravies, other sauces', 'Mustard and other condiments', 'Ketchup', 'Salad dressings and vegetable oils',
  'Butter and animal fats', 'Margarine', 'Sugars and honey', 'Jams, syrups, toppings',
  'Cream cheese, sour cream, whipped cream', 'Peanut butter and other nut butters',
]);

/**
 * Rank a portion for "most common" (the default). USDA doesn't publish usage frequency,
 * so prefer natural household units: a stated serving, then a medium item, then pieces/slices,
 * then cups (or tablespoons for fats, sauces, spices, sweets), then anything but bulk weights.
 */
export function portionRank(label, category, kcal = 0) {
  const l = label.toLowerCase();
  const spoonFirst = SMALL_MEASURE_FIRST.has(category);
  if (l === 'typical amount') return 5.5; // FNDDS survey default: real, but not a household unit
  if (/\b(cubic|surface) inch\b/.test(l)) return 6;
  if (spoonFirst && /\b(tbsp|tsp|tablespoons?|teaspoons?)\b/.test(l)) return 1.8;
  // A cup of something very calorie-dense (nut butter, nuts, oil) is rarely what anyone eats.
  if (/\bcups?\b/.test(l) && kcal > 450) return 6.5;
  if (/nlea serving/.test(l)) return 1.5;
  if (/\bdrink\b/.test(l)) return 2.5; // fountain sizes: a can or bottle is the everyday unit
  if (/^[\d½¼¾⅓⅔]+ oz \(\d/.test(l)) return 2.2; // "1 oz (23 whole kernels)": a described handful
  if (/serving/.test(l)) return 0;
  if (/\bmedium\b/.test(l)) return 1;
  if (/\b(slice|piece|item|each|patty|link|bar|cookie|muffin|packet|package|container|bottle|can|fruit|egg|breast|thigh|drumstick|wing|fillet|chop|steak|sandwich|burrito|taco|pizza|roll|bagel|biscuit|tortilla|pancake|waffle|donut|stalk|spear|leaf|clove|large|small|extra large)\b/.test(l)) return 2;
  const cupFirst = !SMALL_MEASURE_FIRST.has(category);
  if (/\bcups?\b/.test(l)) return cupFirst ? 3 : 4;
  if (/\b(tbsp|tsp|tablespoons?|teaspoons?)\b/.test(l)) return cupFirst ? 4 : 3;
  if (/\b(lb|pound)\b/.test(l)) return 7;
  if (/\boz\b/.test(l) && !/fl oz/.test(l)) return 6;
  return 5;
}

/** Household portions as [label, grams], most common first. Always includes "1 oz". */
export function portions(food, category, kcalPer100 = 0) {
  const seen = new Set();
  const list = food.foodPortions
    .filter((p) => p.gramWeight > 0)
    .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0))
    .map((p) => [portionLabel(p), round1(p.gramWeight)])
    .filter(([label]) => {
      const k = label.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  // Stable sort keeps USDA's sequence within the same rank.
  const rank = ([label, grams]) => portionRank(label, category, (kcalPer100 * grams) / 100);
  list.sort((a, b) => rank(a) - rank(b));
  if (!list.some(([l]) => /^1 oz\b/i.test(l))) list.push(['1 oz', 28.4]);
  return list;
}

// ---------- whole record ----------

/** Compact row: [fdcId, display, name, categoryIndex, kcal, protein, carbs, fat, fiber|null, portions, dataset] */
export function toRow(food, categoryIndex, dataset = 0) {
  const cat = categoryOf(food);
  const n = nutrientsPer100g(food);
  return [
    food.fdcId,
    displayName(food.description),
    food.description,
    categoryIndex(cat),
    n.kcal,
    n.protein_g,
    n.carbs_g,
    n.fat_g,
    n.fiber_g,
    portions(food, cat, n.kcal),
    dataset,
  ];
}

const normName = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Combine datasets. When two foods have the same USDA name, keep the first (SR Legacy)
 * and add any household portions only the other one has. Returns the merged rows.
 */
export function mergeRows(primary, secondary, categoryName = () => '') {
  const byName = new Map(primary.map((r) => [normName(r[2]), r]));
  const out = [...primary];
  let merged = 0;
  for (const r of secondary) {
    const hit = byName.get(normName(r[2]));
    if (!hit) {
      out.push(r);
      continue;
    }
    merged++;
    const have = new Set(hit[9].map(([l]) => l.toLowerCase()));
    const extra = r[9].filter(([l]) => !have.has(l.toLowerCase()) && l !== '1 oz');
    const rank = ([label, grams]) => portionRank(label, categoryName(hit[3]), (hit[4] * grams) / 100);
    hit[9] = [...hit[9], ...extra].sort((a, b) => rank(a) - rank(b)); // stable: USDA order within a rank
  }
  return { rows: out, merged };
}
