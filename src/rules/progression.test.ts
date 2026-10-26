import { describe, expect, it } from 'vitest';
import { bestOneRepMax, estimateOneRepMax, roundDownTo, suggestNext, type ExerciseSession, type Prescription } from './progression';

const press: Prescription = { sets: 3, repMin: 8, repMax: 12, targetRir: 2, increment: 2.5 };
const pushup: Prescription = { sets: 3, repMin: 8, repMax: 15, targetRir: 2, increment: 0 };
const s = (weightKg: number | null, ...reps: number[]): ExerciseSession => ({
  date: '2026-10-01',
  sets: reps.map((r) => ({ weightKg, reps: r, rir: 2 })),
});

describe('double progression', () => {
  it('has no weight for a first session', () => {
    const r = suggestNext(press, []);
    expect(r).toMatchObject({ kind: 'first-time', weightKg: null, targetReps: 8 });
  });

  it('adds reps when inside the range', () => {
    expect(suggestNext(press, [s(20, 10, 9, 8)])).toMatchObject({ kind: 'reps-up', weightKg: 20, targetReps: 9 });
  });

  it('adds the smallest jump when all sets hit the top', () => {
    expect(suggestNext(press, [s(20, 12, 12, 12)])).toMatchObject({ kind: 'increase', weightKg: 22.5, targetReps: 8 });
  });

  it('respects a custom increment', () => {
    expect(suggestNext({ ...press, increment: 1 }, [s(10, 12, 12, 12)]).weightKg).toBe(11);
  });

  it('does not increase if fewer sets were done', () => {
    expect(suggestNext(press, [s(20, 12, 12)])).toMatchObject({ kind: 'hold', weightKg: 20 });
  });

  it('holds after one session below the range', () => {
    expect(suggestNext(press, [s(25, 8, 7, 6), s(25, 9, 8, 8)])).toMatchObject({ kind: 'hold', weightKg: 25 });
  });

  it('reduces ~10% after two sessions below the range', () => {
    // 25 × 0.9 = 22.5, already a multiple of 2.5
    expect(suggestNext(press, [s(25, 8, 7, 6), s(25, 8, 7, 7)])).toMatchObject({ kind: 'reduce', weightKg: 22.5 });
  });

  it('always reduces by at least one increment', () => {
    // 10 × 0.9 = 9 → floored to 7.5 with 2.5 kg steps
    expect(suggestNext(press, [s(10, 6, 6, 6), s(10, 6, 6, 6)]).weightKg).toBe(7.5);
    // 5 kg jumps: 10 × 0.9 = 9 → 5
    expect(suggestNext({ ...press, increment: 5 }, [s(10, 6, 6, 6), s(10, 6, 6, 6)]).weightKg).toBe(5);
  });

  it('progresses bodyweight work by reps, then variation', () => {
    expect(suggestNext(pushup, [s(null, 10, 9, 8)])).toMatchObject({ kind: 'reps-up', targetReps: 9 });
    expect(suggestNext(pushup, [s(null, 15, 15, 15)]).kind).toBe('harder-variation');
  });

  it('never targets above the top of the range', () => {
    expect(suggestNext(press, [s(20, 12, 12, 11)]).targetReps).toBe(12);
  });
});

describe('missed sessions', () => {
  const at = (date: string, w: number, ...reps: number[]) => ({ ...s(w, ...reps), date });

  it('progresses normally within two weeks', () => {
    expect(suggestNext(press, [at('2026-10-01', 20, 12, 12, 12)], '2026-10-10').kind).toBe('increase');
  });

  it('holds instead of increasing after 14+ days off', () => {
    const r = suggestNext(press, [at('2026-10-01', 20, 12, 12, 12)], '2026-10-16');
    expect(r).toMatchObject({ kind: 'hold', weightKg: 20, targetReps: 12 });
    expect(r.reasons[0]).toMatch(/15 days ago/);
  });

  it('starts ~10% lighter after 28+ days off', () => {
    expect(suggestNext(press, [at('2026-09-01', 25, 10, 10, 10)], '2026-10-01')).toMatchObject({ kind: 'reduce', weightKg: 22.5, targetReps: 8 });
  });

  it('eases bodyweight work back in by reps', () => {
    expect(suggestNext(pushup, [at('2026-09-01', 0, 12, 12, 12)].map((x) => ({ ...x, sets: x.sets.map((y) => ({ ...y, weightKg: null })) })), '2026-10-15'))
      .toMatchObject({ kind: 'hold', targetReps: 8 });
  });

  it('works when reps in reserve were not recorded', () => {
    const noRir = { date: '2026-10-01', sets: [12, 12, 12].map((reps) => ({ weightKg: 20, reps, rir: null })) };
    expect(suggestNext(press, [noRir], '2026-10-03')).toMatchObject({ kind: 'increase', weightKg: 22.5 });
  });
});

describe('helpers', () => {
  it('rounds down to increments without float errors', () => {
    expect(roundDownTo(47.5, 2.5)).toBe(47.5);
    expect(roundDownTo(48.9, 2.5)).toBe(47.5);
  });

  it('estimates 1RM with reps in reserve', () => {
    expect(estimateOneRepMax({ weightKg: 60, reps: 8, rir: 2 })).toBeCloseTo(80);
    expect(estimateOneRepMax({ weightKg: 60, reps: 14, rir: 3 })).toBeNull();
    expect(estimateOneRepMax({ weightKg: null, reps: 10, rir: 0 })).toBeNull();
    expect(bestOneRepMax([{ weightKg: 50, reps: 10, rir: 0 }, { weightKg: 55, reps: 8, rir: 0 }])).toBeCloseTo(69.67, 1);
  });
});
