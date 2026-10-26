import { describe, expect, it } from 'vitest';
import { adjustCalories, initialTargets, macrosFor, restingEnergy, type Profile } from './nutrition';

const me: Profile = { sex: 'male', age: 25, heightCm: 175, weightKg: 62, activity: 'moderate', gainRatePctPerWeek: 0.4 };

describe('initial targets', () => {
  it('uses Mifflin-St Jeor for resting energy', () => {
    expect(restingEnergy(me)).toBeCloseTo(1593.75);
    expect(restingEnergy({ ...me, sex: 'female' })).toBeCloseTo(1427.75);
  });

  it('adds a surplus for the gain rate and rounds to 50 kcal', () => {
    // 1593.75 × 1.55 = 2470 maintenance; 0.4% of 62 kg = 0.248 kg/wk ≈ +273 kcal.
    const { targets, reasons } = initialTargets(me);
    expect(targets.calories).toBe(2750);
    expect(targets.proteinG).toBe(110);
    expect(targets.fatG).toBe(75);
    expect(targets.carbsG).toBe(410);
    expect(reasons.length).toBeGreaterThan(3);
  });

  it('keeps a fat floor on low calories', () => {
    expect(macrosFor(1200, 80).fatG).toBe(50); // 0.6 g/kg × 80 = 48 → 50, above 25% (33 g)
  });
});

describe('calorie adjustment', () => {
  const base = { currentCalories: 2750, weightKg: 62, gainRatePctPerWeek: 0.4, completeFoodDays: 12, avgIntakeKcal: 2720 };

  it('waits for enough weigh-ins', () => {
    expect(adjustCalories({ ...base, trendKgPerWeek: null }).kind).toBe('insufficient-data');
  });

  it('waits for enough complete food days', () => {
    expect(adjustCalories({ ...base, trendKgPerWeek: 0, completeFoodDays: 6 }).kind).toBe('insufficient-data');
  });

  it('keeps calories when the trend is within tolerance', () => {
    expect(adjustCalories({ ...base, trendKgPerWeek: 0.2 }).kind).toBe('no-change');
  });

  it('raises calories when gaining too slowly, capped at +250', () => {
    const r = adjustCalories({ ...base, trendKgPerWeek: -0.1 });
    expect(r).toMatchObject({ kind: 'change', fromCalories: 2750, toCalories: 3000 });
  });

  it('makes a proportional change below the cap', () => {
    // goal 0.248, trend 0.1 → diff 0.148 kg × 7700 / 7 ≈ 163 → 150
    const r = adjustCalories({ ...base, trendKgPerWeek: 0.1 });
    expect(r).toMatchObject({ kind: 'change', toCalories: 2900 });
  });

  it('lowers calories when gaining too fast', () => {
    const r = adjustCalories({ ...base, trendKgPerWeek: 0.6 });
    expect(r).toMatchObject({ kind: 'change', toCalories: 2500 });
  });

  it('asks to hit the current target before changing it', () => {
    const r = adjustCalories({ ...base, trendKgPerWeek: -0.1, avgIntakeKcal: 2300 });
    expect(r.kind).toBe('no-change');
  });
});
