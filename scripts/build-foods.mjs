#!/usr/bin/env node
// Builds public/foods.json (the offline food table) from two USDA FoodData Central datasets:
//   - SR Legacy (April 2018): basic foods and ingredients, lab-analyzed
//   - FNDDS / Survey foods (October 2024): foods as Americans report eating them,
//     including mixed dishes, dips and restaurant items
// Both are public domain (CC0 1.0).
//
// Run by hand when a source changes:  npm run foods
// The app never fetches USDA data at runtime; it ships this generated file and the
// service worker precaches it. The generated file is committed so deploys don't
// depend on USDA's servers.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATASETS, categoryOf, disambiguate, isExcludedCategory, mergeRows, toRow } from './foods-transform.mjs';

const SOURCES = [
  {
    code: 'sr',
    label: 'SR Legacy (2018-04)',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip',
    key: 'SRLegacyFoods',
  },
  {
    code: 'fndds',
    label: 'FNDDS survey foods (2024-10)',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip',
    key: 'SurveyFoods',
  },
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'foods.json');
const SIZE_LIMIT = 5 * 1024 * 1024; // compressed

async function load(src) {
  const dir = join(root, '.cache', 'usda', src.code);
  mkdirSync(dir, { recursive: true });
  const zip = join(dir, 'data.zip');
  if (!existsSync(zip)) {
    console.log(`Downloading ${src.url}`);
    const res = await fetch(src.url);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  let json = readdirSync(dir).find((f) => f.endsWith('.json'));
  if (!json) {
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
    json = readdirSync(dir).find((f) => f.endsWith('.json'));
  }
  return JSON.parse(readFileSync(join(dir, json), 'utf8'))[src.key];
}

const categories = [];
const catIndex = (c) => {
  let i = categories.indexOf(c);
  if (i === -1) i = categories.push(c) - 1;
  return i;
};

const perSource = [];
for (const src of SOURCES) {
  const foods = await load(src);
  const kept = foods.filter((f) => !isExcludedCategory(categoryOf(f)));
  const rows = kept.map((f) => toRow(f, catIndex, DATASETS.indexOf(src.code)));
  console.log(`${src.label}: ${rows.length} kept of ${foods.length}`);
  perSource.push(rows);
}

const { rows, merged } = mergeRows(perSource[0], perSource[1], (i) => categories[i]);
console.log(`Merged ${merged} foods that appear in both; ${rows.length} total`);
disambiguate(rows);
rows.sort((a, b) => a[1].localeCompare(b[1]));

const payload = {
  source: `USDA FoodData Central: ${SOURCES.map((s) => s.label).join('; ')}. Public domain (CC0 1.0).`,
  fields: ['fdcId', 'display', 'name', 'category', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'portions', 'dataset'],
  datasets: DATASETS,
  per: '100 g',
  categories,
  foods: rows,
};
const text = JSON.stringify(payload);
const gz = gzipSync(text).length;
console.log(`Size: ${(text.length / 1024 / 1024).toFixed(2)} MB raw, ${(gz / 1024 / 1024).toFixed(2)} MB gzip`);
if (gz > SIZE_LIMIT) {
  console.error('Over the ~5 MB compressed limit. Categories by compressed size:');
  const byCat = categories.map((c, i) => [c, gzipSync(JSON.stringify(rows.filter((r) => r[3] === i))).length]);
  byCat.sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.error(`  ${(n / 1024).toFixed(0)} KB  ${c}`));
  process.exit(1);
}
writeFileSync(out, text);
console.log(`Wrote ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
