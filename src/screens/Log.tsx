import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { DayTotals } from '../components/DayTotals';
import { EntryRow } from '../components/EntryRow';
import { IconChevron } from '../components/Icons';
import { getBundleForDate } from '../lib/db';
import { addDays, longDate } from '../lib/format';
import { entriesForDate, sumTotals } from '../lib/log';
import { useToday } from '../lib/useToday';

// Phase scope: browse, edit and delete entries by day. Weight and the weekly
// check-in form arrive with SPEC.md Phase 3.

export function LogScreen() {
  const today = useToday();
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const entries = useLiveQuery(() => entriesForDate(date), [date]);
  // Targets come from the plan that covered that date, even if a newer plan is active.
  const stored = useLiveQuery(async () => (await getBundleForDate(date)) ?? null, [date]);
  const day = stored?.bundle.days.find((d) => d.date === date);
  const target = day ? stored!.bundle.targets.day_types[day.day_type] : undefined;

  return (
    <>
      <header className="page-head">
        <h1>Log</h1>
      </header>

      <div className="date-nav">
        <button className="btn icon-btn" aria-label="Previous day" onClick={() => setPicked(addDays(date, -1))}>
          <IconChevron dir="left" />
        </button>
        <div className="date-nav-label">
          <strong>{date === today ? 'Today' : longDate(date)}</strong>
          {date === today && <span className="small muted">{longDate(date)}</span>}
        </div>
        <button className="btn icon-btn" aria-label="Next day" disabled={date >= today} onClick={() => setPicked(addDays(date, 1) > today ? today : addDays(date, 1))}>
          <IconChevron dir="right" />
        </button>
      </div>
      {date !== today && (
        <div className="btn-row" style={{ justifyContent: 'center', marginBottom: 12 }}>
          <button className="btn btn-quiet" onClick={() => setPicked(null)}>Back to today</button>
        </div>
      )}

      {entries && (
        <div className="today-layout">
          <DayTotals totals={sumTotals(entries)} target={target} title={date === today ? 'Eaten so far' : 'Eaten'} />
          {entries.length ? (
            <ol className="timeline" aria-label="Entries">
              {entries.map((e) => (
                <li key={e.id}>
                  <EntryRow entry={e} />
                </li>
              ))}
            </ol>
          ) : (
            <div className="card muted">Nothing logged for this day.</div>
          )}
        </div>
      )}
    </>
  );
}
