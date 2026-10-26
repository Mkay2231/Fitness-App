import { describe, expect, it } from 'vitest';
import { suggestNext } from './progression';
import { defaultIncrements, fromLength, fromWeight, tidy, toLength, toWeight } from './units';

describe('units', () => {
  it('round-trips weight and length', () => {
    expect(tidy(toWeight(fromWeight(135, 'lb'), 'lb'))).toBe(135);
    expect(tidy(toWeight(62, 'kg'))).toBe(62);
    expect(tidy(toLength(fromLength(70, 'in'), 'in'))).toBe(70);
    expect(tidy(fromLength(70, 'in'), 1)).toBe(177.8);
  });

  it('progresses in clean pound steps when increments are set in lb', () => {
    const inc = defaultIncrements('lb').dumbbell; // 5 lb in kg
    const last = { date: '2026-10-01', sets: [12, 12, 12].map((reps) => ({ weightKg: fromWeight(40, 'lb'), reps, rir: 2 })) };
    const next = suggestNext({ sets: 3, repMin: 8, repMax: 12, targetRir: 2, increment: inc }, [last]);
    expect(tidy(toWeight(next.weightKg!, 'lb'))).toBe(45);
  });

  it('reduces to a clean pound weight', () => {
    const inc = defaultIncrements('lb').dumbbell;
    const s = { date: 'x', sets: [6, 6, 6].map((reps) => ({ weightKg: fromWeight(50, 'lb'), reps, rir: 0 })) };
    const next = suggestNext({ sets: 3, repMin: 8, repMax: 12, targetRir: 2, increment: inc }, [s, s]);
    expect(tidy(toWeight(next.weightKg!, 'lb'))).toBe(45);
  });
});
