import { describe, expect, it } from 'vitest';
import { comparePerformance } from './performance';

const fw = (kg: number) => `${kg.toFixed(1)} kg`;
const fd = (d: string) => d;
const sess = (date: string, w: number | null, ...reps: number[]) => ({ date, sets: reps.map((r) => ({ weightKg: w, reps: r, rir: null })) });
const cmp = (a: ReturnType<typeof sess>, b?: ReturnType<typeof sess>) => comparePerformance('x', 'Leg press', a, b, fw, fd);

describe('performance comparison', () => {
  it('marks a first record as new', () => {
    expect(cmp(sess('2026-10-20', 40, 10))).toMatchObject({ status: 'new', changePct: null });
  });

  it('detects improvement by estimated 1RM', () => {
    const r = cmp(sess('2026-10-20', 45, 8, 8), sess('2026-10-13', 40, 8, 8));
    expect(r.status).toBe('up');
    expect(r.evidence).toMatch(/45\.0 kg × 8 .* vs 40\.0 kg × 8/);
  });

  it('treats small changes as about the same', () => {
    // e1RM 80 vs 78.7 kg: +1.7%, under the 2% threshold
    expect(cmp(sess('2026-10-20', 60, 10), sess('2026-10-13', 59, 10)).status).toBe('flat');
    // 40×12 vs 40×11 is +2.4%: counts as up
    expect(cmp(sess('2026-10-20', 40, 12), sess('2026-10-13', 40, 11)).status).toBe('up');
  });

  it('detects a drop', () => {
    expect(cmp(sess('2026-10-20', 40, 6), sess('2026-10-13', 40, 10)).status).toBe('down');
  });

  it('compares bodyweight work by reps', () => {
    expect(cmp(sess('2026-10-20', null, 12), sess('2026-10-13', null, 10))).toMatchObject({ status: 'up', changePct: 20 });
  });

  it('refuses to compare very high-rep sets', () => {
    expect(cmp(sess('2026-10-20', 20, 20), sess('2026-10-13', 20, 18)).status).toBe('not-comparable');
  });
});
