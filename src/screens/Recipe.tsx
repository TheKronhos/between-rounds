import { IconBack } from '../components/Icons';
import { minutes, num, qty } from '../lib/format';
import { useActivePlan } from '../lib/hooks';
import { href } from '../lib/router';
import type { Macros } from '../lib/types';

// Phase 1: read-only recipe view reached from the Week screen.
// Phase 2 adds the ingredient checklist, servings scaler, and cook mode.

export function RecipeScreen({ id, variantId }: { id: string; variantId?: string }) {
  const plan = useActivePlan();
  if (plan === undefined) return null;
  const recipe = plan?.bundle.recipes.find((r) => r.id === id);

  const back = (
    <a className="back no-print" href={href('/week')} onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }}>
      <IconBack /> Back
    </a>
  );

  if (!recipe) {
    return (
      <>
        {back}
        <div className="card empty">
          <h2>Recipe not found</h2>
          <p className="muted">"{id}" isn't in the current plan.</p>
        </div>
      </>
    );
  }

  const variant = variantId ? recipe.variants.find((v) => v.id === variantId) : undefined;

  return (
    <>
      {back}
      <header className="page-head" style={{ display: 'block' }}>
        <h1>{recipe.name}</h1>
        <div className="recipe-meta">
          <span className="chip">{minutes(recipe.active_min)} active</span>
          <span className="chip">{minutes(recipe.total_min)} total</span>
          <span className="chip">Makes {qty(recipe.yield_servings)}</span>
          {recipe.tags.map((t) => (
            <span key={t} className="chip chip-outline">{t}</span>
          ))}
        </div>
      </header>

      {variant && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Planned: {variant.label}</h3>
          {variant.changes && <p style={{ marginTop: 4 }}>{variant.changes}</p>}
          <MacroRow m={variant} />
        </div>
      )}

      <div className="two-pane">
        <div className="stack">
          <section className="card">
            <h2>Per serving</h2>
            <MacroRow m={recipe.per_serving} />
          </section>
          <section className="card">
            <h2>Ingredients</h2>
            <ul className="plain" style={{ marginTop: 10 }}>
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>
                  {ing.qty !== null && <strong>{qty(ing.qty)} {ing.unit} </strong>}
                  {ing.qty === null && ing.unit && <strong>{ing.unit} </strong>}
                  {ing.item}
                </li>
              ))}
            </ul>
          </section>
          {(recipe.portion_notes.me || recipe.portion_notes.son) && (
            <section className="card">
              <h2>Portions</h2>
              <dl className="facts" style={{ marginTop: 10 }}>
                {recipe.portion_notes.me && (<><dt>Me</dt><dd>{recipe.portion_notes.me}</dd></>)}
                {recipe.portion_notes.son && (<><dt>Son</dt><dd>{recipe.portion_notes.son}</dd></>)}
              </dl>
            </section>
          )}
        </div>
        <div className="stack">
          <section className="card">
            <h2>Steps</h2>
            <ol className="steps" style={{ marginTop: 10 }}>
              {recipe.steps.map((s, i) => (
                <li key={i}>{s.text}</li>
              ))}
            </ol>
          </section>
          {recipe.swaps.length > 0 && (
            <section className="card">
              <h2>Swaps</h2>
              <ul className="plain" style={{ marginTop: 10 }}>
                {recipe.swaps.map((s, i) => (
                  <li key={i}>
                    {s.label} <span className="muted small">· {num(s.kcal)} kcal · {num(s.protein_g)} g P</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {recipe.storage && (
            <section className="card">
              <h2>Storage</h2>
              <p style={{ marginTop: 6 }}>{recipe.storage}</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function MacroRow({ m }: { m: Macros }) {
  return (
    <div className="macro-row" style={{ marginTop: 10 }}>
      <div><strong>{num(m.kcal)}</strong><span>kcal</span></div>
      <div><strong>{num(m.protein_g)}</strong><span>protein g</span></div>
      <div><strong>{num(m.carbs_g)}</strong><span>carbs g</span></div>
      <div><strong>{num(m.fat_g)}</strong><span>fat g</span></div>
    </div>
  );
}
