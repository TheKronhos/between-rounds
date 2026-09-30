import { useState } from 'react';
import { db } from '../lib/db';
import { num, qty } from '../lib/format';
import { foodItem, nutritionFor, type FoodHit } from '../lib/foodTable';
import { multLabel, newId, savedFoodItem } from '../lib/log';
import type { ItemSource, LogItem, SavedFood } from '../lib/types';
import { NumField, TextField } from './Fields';
import { IconChevron } from './Icons';

// Tier 1b: pick a serving of an offline food-table result, or save your own food.
// Grams are never required; they live under "More".

const MULTS = [0.5, 1, 1.5, 2];

const parseAmount = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

export function ServingPicker({
  food,
  onAdd,
  onSaveAsMine,
  onBack,
}: {
  food: FoodHit;
  onAdd: (item: LogItem) => void;
  onSaveAsMine: (prefill: MyFoodDraft) => void;
  onBack: () => void;
}) {
  const [pi, setPi] = useState(0); // portions are stored most-common first
  const [countText, setCountText] = useState('1');
  const [more, setMore] = useState(false);
  const [gramsText, setGramsText] = useState('');

  const portion = food.portions[pi];
  const count = parseAmount(countText);
  const grams = more ? parseAmount(gramsText) : null;
  const totalGrams = grams ?? (count ? portion[1] * count : 0);
  const n = nutritionFor(food, totalGrams);
  const amountLabel = grams ? `${Math.round(grams)} g` : count === 1 ? portion[0] : `${qty(count ?? 0)} × ${portion[0]}`;
  const ready = grams !== null || count !== null;

  return (
    <section className="picker stack" aria-label={`Choose a serving of ${food.display}`}>
      <button className="btn btn-quiet back-btn" onClick={onBack}>
        <IconChevron dir="left" size={18} /> Back to results
      </button>
      <div>
        <h3 className="picker-name">{food.display}</h3>
        {food.name !== food.display && <p className="small muted">{food.name}</p>}
        <p className="small faint">{food.category} · USDA (offline)</p>
      </div>

      <fieldset className="plain-fieldset" disabled={grams !== null}>
        <legend className="group-head">Serving</legend>
        <div className="portion-list">
          {food.portions.map(([label], i) => (
            <button key={label} className="portion-opt" aria-pressed={i === pi} onClick={() => setPi(i)}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="plain-fieldset" disabled={grams !== null}>
        <legend className="group-head">How many</legend>
        <div className="count-row">
          <div className="segmented mult" role="group" aria-label="Amount">
            {MULTS.map((m) => (
              <button key={m} aria-pressed={count === m} onClick={() => setCountText(String(m))}>
                {multLabel(m)}
              </button>
            ))}
          </div>
          <label className="count-field">
            <span className="visually-hidden">Count</span>
            <input
              type="text"
              inputMode="decimal"
              value={countText}
              onChange={(e) => /^\d*[.,]?\d*$/.test(e.target.value) && setCountText(e.target.value)}
              aria-label="How many servings"
            />
          </label>
        </div>
      </fieldset>

      <div>
        <button className="btn btn-quiet edit-nums" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'Hide grams' : 'More'}
        </button>
        {more && (
          <div className="panel stack-sm">
            <label className="field">
              <span>Weigh it instead (grams)</span>
              <input type="text" inputMode="decimal" value={gramsText} placeholder={String(Math.round(portion[1] * (count ?? 1)))} onChange={(e) => /^\d*[.,]?\d*$/.test(e.target.value) && setGramsText(e.target.value)} />
            </label>
            <p className="small muted">
              {grams ? 'Using grams. Clear this box to go back to servings.' : `${amountLabel} is about ${Math.round(totalGrams)} g.`}
            </p>
          </div>
        )}
      </div>

      <div className="preview" aria-live="polite">
        <div className="preview-amount">{amountLabel}</div>
        <div className="preview-kcal">{num(n.kcal)} kcal</div>
        <div className="small">
          {num(n.protein_g)} g protein · {num(n.carbs_g)} g carbs · {num(n.fat_g)} g fat
          {n.fiber_g !== null && ` · ${num(n.fiber_g)} g fiber`}
        </div>
      </div>

      <div className="picker-actions">
        <button className="btn btn-primary" disabled={!ready} onClick={() => onAdd(foodItem(food, portion, count ?? 1, grams ?? undefined))}>
          Add to entry
        </button>
        <button
          className="btn"
          disabled={!ready}
          onClick={() => onSaveAsMine({ name: food.display, portion: amountLabel, ...n, origin: 'usda' })}
        >
          Save as my food
        </button>
      </div>
    </section>
  );
}

/** Numbers are null when blank (a new food), so a real 0 kcal stays 0. */
export type MyFoodDraft = {
  name: string;
  portion: string;
  origin: ItemSource;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
};

/**
 * Create or save "my food": name, serving label, and nutrition per serving.
 * Saved foods show first in every future search.
 */
export function MyFoodForm({
  draft,
  title,
  onDone,
  onCancel,
}: {
  draft: MyFoodDraft;
  title: string;
  onDone: (added: LogItem | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(draft.name);
  const [portion, setPortion] = useState(draft.portion);
  const [v, setV] = useState<{ kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }>({
    kcal: draft.kcal, protein_g: draft.protein_g, carbs_g: draft.carbs_g, fat_g: draft.fat_g,
  });
  const ok = name.trim() !== '' && v.kcal !== null;

  const save = async (andAdd: boolean) => {
    const now = new Date().toISOString();
    const food: SavedFood = {
      id: newId(),
      name: name.trim(),
      portion: portion.trim() || '1 serving',
      kcal: v.kcal ?? 0,
      protein_g: v.protein_g ?? 0,
      carbs_g: v.carbs_g ?? 0,
      fat_g: v.fat_g ?? 0,
      fiber_g: draft.fiber_g,
      origin: draft.origin,
      created_at: now,
      last_used_at: now,
    };
    await db.foods.add(food);
    onDone(andAdd ? savedFoodItem(food) : null);
  };

  return (
    <section className="panel stack" aria-label={title}>
      <h3>{title}</h3>
      <div className="num-grid">
        <TextField label="Name" value={name} onChange={setName} wide />
        <TextField label="Serving (e.g. 1 sandwich, 2 cookies)" value={portion} onChange={setPortion} wide />
        <NumField label="kcal per serving" value={v.kcal} onChange={(x) => setV({ ...v, kcal: x })} optional />
        <NumField label="Protein g" value={v.protein_g} onChange={(x) => setV({ ...v, protein_g: x })} optional />
        <NumField label="Carbs g" value={v.carbs_g} onChange={(x) => setV({ ...v, carbs_g: x })} optional />
        <NumField label="Fat g" value={v.fat_g} onChange={(x) => setV({ ...v, fat_g: x })} optional />
      </div>
      {!ok && <p className="small muted">Name and kcal are needed.</p>}
      <div className="picker-actions">
        <button className="btn btn-primary" disabled={!ok} onClick={() => save(true)}>
          Save and add to entry
        </button>
        <button className="btn" disabled={!ok} onClick={() => save(false)}>
          Save only
        </button>
        <button className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
