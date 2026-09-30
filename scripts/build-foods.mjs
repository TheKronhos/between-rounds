#!/usr/bin/env node
// Builds public/foods.json (the offline food table) from USDA FoodData Central SR Legacy.
// Run by hand when the source changes:  npm run foods
// The app never fetches USDA data at runtime; it ships this generated file and the
// service worker precaches it. The generated file is committed so deploys don't
// depend on USDA's servers.
//
// Source: USDA FoodData Central, SR Legacy (April 2018). Public domain (CC0 1.0).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCLUDED_CATEGORIES, disambiguate, toRow } from './foods-transform.mjs';

const URL = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache', 'usda');
const out = join(root, 'public', 'foods.json');
const SIZE_LIMIT = 5 * 1024 * 1024; // compressed

mkdirSync(cache, { recursive: true });
const zip = join(cache, 'sr_legacy.zip');
if (!existsSync(zip)) {
  console.log(`Downloading ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
}
let jsonFile = readdirSync(cache).find((f) => f.endsWith('.json'));
if (!jsonFile) {
  execFileSync('unzip', ['-o', '-q', zip, '-d', cache]);
  jsonFile = readdirSync(cache).find((f) => f.endsWith('.json'));
}

const { SRLegacyFoods: foods } = JSON.parse(readFileSync(join(cache, jsonFile), 'utf8'));
const categories = [];
const catIndex = (c) => {
  let i = categories.indexOf(c);
  if (i === -1) i = categories.push(c) - 1;
  return i;
};

const kept = foods.filter((f) => !EXCLUDED_CATEGORIES.includes(f.foodCategory?.description));
const rows = kept.map((f) => toRow(f, catIndex));
disambiguate(rows);
rows.sort((a, b) => a[1].localeCompare(b[1]));

const payload = {
  source: 'USDA FoodData Central, SR Legacy (2018-04). Public domain (CC0 1.0).',
  fields: ['fdcId', 'display', 'name', 'category', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'portions'],
  per: '100 g',
  categories,
  foods: rows,
};
const text = JSON.stringify(payload);
const gz = gzipSync(text).length;
console.log(`Foods: ${rows.length} kept of ${foods.length} (excluded: ${EXCLUDED_CATEGORIES.join(', ')})`);
console.log(`Size: ${(text.length / 1024 / 1024).toFixed(2)} MB raw, ${(gz / 1024 / 1024).toFixed(2)} MB gzip`);
if (gz > SIZE_LIMIT) {
  console.error('Over the ~5 MB compressed limit. Categories by compressed size:');
  const byCat = categories.map((c, i) => [c, gzipSync(JSON.stringify(rows.filter((r) => r[3] === i))).length]);
  byCat.sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.error(`  ${(n / 1024).toFixed(0)} KB  ${c}`));
  process.exit(1);
}
writeFileSync(out, text);
console.log(`Wrote ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
