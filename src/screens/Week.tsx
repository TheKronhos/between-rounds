import { DayTypeChip, TrainingChip } from '../components/DayTypeChip';
import { NoPlan } from '../components/NoPlan';
import { capitalize, dateRange, monthDay, num, time12, todayISO, weekdayShort } from '../lib/format';
import { useActivePlan } from '../lib/hooks';
import { href } from '../lib/router';
import type { PlanBundle, PlanDay } from '../lib/types';

export function WeekScreen() {
  const plan = useActivePlan();
  if (plan === undefined) return null;
  if (plan === null) {
    return (
      <>
        <header className="page-head">
          <h1>Week</h1>
        </header>
        <NoPlan />
      </>
    );
  }

  const b = plan.bundle;
  const today = todayISO();
  return (
    <>
      <header className="page-head">
        <h1>Week</h1>
        <span className="sub">{dateRange(b.valid_from, b.valid_to)}</span>
      </header>

      {b.notes && (
        <section className="card" aria-label="Notes from your nutritionist">
          <h3>From your nutritionist</h3>
          <p className="plan-notes muted" style={{ marginTop: 6 }}>
            {b.notes}
          </p>
        </section>
      )}

      <div className="week-grid">
        {b.days.map((day) => (
          <DayCard key={day.date} day={day} bundle={b} isToday={day.date === today} />
        ))}
      </div>
    </>
  );
}

function DayCard({ day, bundle, isToday }: { day: PlanDay; bundle: PlanBundle; isToday: boolean }) {
  const recipes = new Map(bundle.recipes.map((r) => [r.id, r]));
  const target = bundle.targets.day_types[day.day_type];
  const plannedKcal = day.meals.reduce((s, m) => s + m.kcal, 0);
  const plannedProtein = day.meals.reduce((s, m) => s + m.protein_g, 0);
  const meals = day.meals.slice().sort((a, b) => a.time.localeCompare(b.time));

  return (
    <section className={`card day${isToday ? ' is-today' : ''}`} aria-label={`${weekdayShort(day.date)} ${monthDay(day.date)}`}>
      <div className="day-head">
        <span className="day-name">
          {weekdayShort(day.date)} {monthDay(day.date)}
        </span>
        {isToday && <span className="chip chip-accent">Today</span>}
      </div>
      <div className="day-chips">
        <DayTypeChip dayType={day.day_type} targets={bundle.targets} />
        {day.training && <TrainingChip />}
      </div>

      <ul className="day-meals">
        {meals.map((m, i) => {
          const r = recipes.get(m.recipe_id);
          const variant = m.variant ? r?.variants.find((v) => v.id === m.variant) : undefined;
          const q = m.variant ? `?v=${encodeURIComponent(m.variant)}` : '';
          return (
            <li key={i}>
              <a className="meal" href={href(`/recipes/${encodeURIComponent(m.recipe_id)}${q}`)}>
                <div className="meal-when">
                  {time12(m.time)} · {capitalize(m.slot)}
                </div>
                <div className="meal-name">
                  {r?.name ?? m.recipe_id}
                  {variant && <span className="muted"> · {variant.label}</span>}
                  {m.servings !== 1 && <span className="muted"> ×{m.servings}</span>}
                </div>
                <div className="meal-macros">
                  {num(m.kcal)} kcal · {num(m.protein_g)} g protein
                </div>
                {m.notes && <div className="meal-extra">{m.notes}</div>}
                {m.son_plate && <div className="meal-extra">Son: {m.son_plate}</div>}
              </a>
            </li>
          );
        })}
      </ul>

      <div className="day-total">
        <div>
          <strong>{num(plannedKcal)} kcal</strong> · <strong>{num(plannedProtein)} g</strong> protein planned
        </div>
        {target && (
          <div className="small faint">
            {target.label} target: {num(target.kcal)} kcal · {num(target.protein_g)} g
          </div>
        )}
      </div>
    </section>
  );
}
