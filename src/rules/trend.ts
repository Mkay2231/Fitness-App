import { daysBetween, type ISODate } from './dates';

export interface WeighIn { date: ISODate; kg: number }

export const TREND_WINDOW_DAYS = 14;
export const MIN_WEIGH_INS = 8;
export const MIN_SPAN_DAYS = 10;

/** Average of weigh-ins within the 7 days ending on `date` (inclusive), or null if none. */
export function sevenDayAverage(entries: WeighIn[], date: ISODate): number | null {
  const inWindow = entries.filter((e) => {
    const d = daysBetween(e.date, date);
    return d >= 0 && d < 7;
  });
  if (inWindow.length === 0) return null;
  return inWindow.reduce((s, e) => s + e.kg, 0) / inWindow.length;
}

/**
 * Weight change in kg/week: least-squares slope of the weigh-ins in the
 * 14 days ending on `asOf`. Returns null when data is too sparse to trust.
 */
export function weeklyRate(entries: WeighIn[], asOf: ISODate): number | null {
  const pts = entries
    .map((e) => ({ x: -daysBetween(e.date, asOf), y: e.kg }))
    .filter((p) => p.x <= 0 && p.x > -TREND_WINDOW_DAYS);
  if (pts.length < MIN_WEIGH_INS) return null;
  const xs = pts.map((p) => p.x);
  if (Math.max(...xs) - Math.min(...xs) < MIN_SPAN_DAYS - 1) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : (num / den) * 7;
}
