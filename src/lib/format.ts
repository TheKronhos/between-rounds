// Display helpers. Data is 24-hour / ISO; the UI is 12-hour / US.
// Dates are handled as local "YYYY-MM-DD" strings to avoid timezone drift.

export function todayISO(now = new Date()): string {
  return toISODate(now);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" as a local date at noon (noon avoids DST edge cases). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** "18:30" → "6:30 PM" */
export function time12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "2026-09-27" → "Sun" */
export function weekdayShort(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { weekday: 'short' });
}

/** "2026-09-27" → "Sep 27" */
export function monthDay(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "2026-09-27" → "Sunday, Sep 27" */
export function longDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function dateRange(from: string, to: string): string {
  return `${monthDay(from)} – ${monthDay(to)}`;
}

export function timestamp(isoTs: string): string {
  return new Date(isoTs).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Quantities as friendly fractions: 0.5 → "½", 1.25 → "1¼". */
export function qty(n: number | null): string {
  if (n === null) return '';
  const whole = Math.floor(n);
  const frac = n - whole;
  const fracs: [number, string][] = [
    [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'],
    [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞'],
  ];
  if (frac < 0.01) return String(whole);
  const hit = fracs.find(([v]) => Math.abs(v - frac) < 0.02);
  if (hit) return whole ? `${whole}${hit[1]}` : hit[1];
  return String(Math.round(n * 100) / 100);
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function minutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
