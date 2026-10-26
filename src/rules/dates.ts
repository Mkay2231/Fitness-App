// Dates are stored as local calendar days ("YYYY-MM-DD") so a set logged at
// 11pm in Lagos never lands on the wrong day.

export type ISODate = string;

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  // Round to absorb daylight-saving shifts (not used in Nigeria, but safe).
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

/** Monday of the week containing `s`. */
export function weekStart(s: ISODate): ISODate {
  const dow = parseISODate(s).getDay(); // 0 = Sunday
  return addDays(s, dow === 0 ? -6 : 1 - dow);
}

export function weekDates(monday: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(s: ISODate): number {
  const dow = parseISODate(s).getDay();
  return dow === 0 ? 7 : dow;
}
