import { describe, expect, it } from 'vitest';
import { FOODS } from './foods';

describe('built-in food library', () => {
  it('has unique ids', () => {
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
  });

  it.each(FOODS.map((f) => [f.name, f] as const))('%s has sane values and a citation', (_, f) => {
    for (const v of [f.kcal, f.proteinG, f.carbsG, f.fatG]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(f.proteinG + f.carbsG + f.fatG).toBeLessThanOrEqual(100.5);
    expect(f.source.kind).toBe('reference');
    expect(f.source.citation).toMatch(/FAO|USDA/);
    // Energy should roughly match 4/4/9 kcal per gram (sources also count fibre, so allow slack).
    const atwater = f.proteinG * 4 + f.carbsG * 4 + f.fatG * 9;
    expect(Math.abs(f.kcal - atwater)).toBeLessThanOrEqual(Math.max(25, f.kcal * 0.15));
  });
});
