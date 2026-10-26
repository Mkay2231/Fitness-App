import { describe, expect, it } from 'vitest';
import { categoriesOf, fitsPreferences } from './foodPrefs';

describe('food preferences', () => {
  it('finds categories in food names', () => {
    expect(categoriesOf('Shaki (beef tripe), stewed')).toEqual(['beef']);
    expect(categoriesOf('Mackerel (titus), boiled')).toEqual(['fish']);
    expect(categoriesOf('Crayfish, dried')).toEqual(['fish']);
    expect(categoriesOf('Evaporated milk')).toEqual(['dairy']);
    expect(categoriesOf('Egg, boiled')).toEqual(['eggs']);
    expect(categoriesOf('White rice, boiled')).toEqual([]);
  });

  it('does not confuse egusi or akara (bean fritters) with eggs', () => {
    expect(categoriesOf('Egusi (melon seed kernels), dried')).toEqual([]);
    expect(categoriesOf('akara and pap')).toEqual([]);
  });

  it('filters by avoided categories', () => {
    expect(fitsPreferences('Chicken, dark meat, no skin, stewed', ['pork'])).toBe(true);
    expect(fitsPreferences('Corned beef, canned', ['beef'])).toBe(false);
    expect(fitsPreferences('Eba with egusi and beef', ['beef'])).toBe(false);
  });
});
