import { num } from '../lib/format';
import type { DayTypeTarget, Nutrition } from '../lib/types';

// Neutral by design (SPEC rule 4): one calm color, bars stop at full width, no "over" styling.

function Bar({ label, value, target, unit, range }: { label: string; value: number; target?: number; unit: string; range?: [number, number] }) {
  const max = range ? range[1] : target;
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const of = range ? `${num(range[0])}–${num(range[1])}` : target !== undefined ? num(target) : undefined;
  return (
    <div className="total-row">
      <div className="total-label">
        <span>{label}</span>
        <span className="total-num">
          <strong>{num(value)}</strong>
          {of && <span className="muted"> / {of}</span>} {unit}
        </span>
      </div>
      {max ? (
        <div className="bar" aria-hidden="true">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function DayTotals({ totals, target, title = 'Eaten so far' }: { totals: Nutrition; target?: DayTypeTarget; title?: string }) {
  return (
    <section className="card totals" aria-label={title}>
      <h3>{title}</h3>
      <Bar label="Calories" value={totals.kcal} target={target?.kcal} unit="kcal" />
      <Bar label="Protein" value={totals.protein_g} target={target?.protein_g} unit="g" />
      <Bar label="Carbs" value={totals.carbs_g} range={target?.carbs_g} unit="g" />
      <p className="small muted totals-secondary">
        Fat {num(totals.fat_g)}
        {target && ` / ${num(target.fat_g[0])}–${num(target.fat_g[1])}`} g · Fiber{' '}
        {totals.fiber_g === null ? '—' : num(totals.fiber_g)}
        {target && ` / ${num(target.fiber_g)}`} g
      </p>
    </section>
  );
}
