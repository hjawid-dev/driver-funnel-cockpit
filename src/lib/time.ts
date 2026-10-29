export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** "25 min", "9 h", "3 d" — compact, for chips and clocks. */
export function formatDuration(ms: number): string {
  const abs = Math.max(0, ms);
  if (abs < HOUR) return `${Math.max(1, Math.floor(abs / MIN))} min`;
  if (abs < 2 * DAY) return `${Math.floor(abs / HOUR)} h`;
  return `${Math.floor(abs / DAY)} d`;
}

/** Whole hours, floored. SLA clocks use hours even past 2 days ("Overdue 28 h"). */
export function formatHours(ms: number): string {
  const abs = Math.max(0, ms);
  if (abs < HOUR) return `${Math.max(1, Math.floor(abs / MIN))} min`;
  return `${Math.floor(abs / HOUR)} h`;
}

/** "3 h ago", "12 d ago", or "in 14 h" for a time ahead */
export function ago(ts: number, now: number): string {
  return ts > now ? `in ${formatDuration(ts - now)}` : `${formatDuration(now - ts)} ago`;
}

export function daysBetween(from: number, to: number): number {
  return (to - from) / DAY;
}

/** "Mon 20 Oct, 14:32" */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

/** "18 Oct 2028": a calendar date with the year, for dates far ahead such as deletion. */
export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The Part 1 case's moment: the latest Tuesday 09:30, local time, at or before `now`. */
export function caseTime(now: number): number {
  const d = new Date(now);
  d.setHours(9, 30, 0, 0);
  while (d.getDay() !== 2 || d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/** Local wall-clock time `days` calendar days from `now` (safe across daylight-saving changes). */
export function atLocal(now: number, days: number, hour: number, minute = 0): number {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}
