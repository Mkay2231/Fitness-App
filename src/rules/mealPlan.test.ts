import { describe, expect, it } from 'vitest';
import { FOODS } from '../seed/foods';
import { MEALS } from '../seed/meals';
import { cookAhead, planDay, planWeek, recipeMacros, shoppingList, usableRecipes, type FoodMacros } from './mealPlan';

const foods = new Map<string, FoodMacros>(FOODS.map((f) => [f.id, f]));
const monday = '2026-10-26';
const targets = { calories: 2750, proteinG: 110 };
const all = usableRecipes(MEALS, undefined, [], foods);

describe('recipes', () => {
  it('only use foods from the cited library', () => {
    for (const r of MEALS) for (const i of r.ingredients) expect(foods.has(i.foodId), `${r.id}: ${i.foodId}`).toBe(true);
  });

  it('have sensible single-serving energy', () => {
    for (const r of MEALS) {
      const kcal = recipeMacros(r, foods).kcal;
      const [lo, hi] = r.kind === 'snack' ? [80, 500] : [300, 1000];
      expect(kcal, r.id).toBeGreaterThan(lo);
      expect(kcal, r.id).toBeLessThan(hi);
    }
  });

  it('drop recipes with foods you avoid, and ones you did not pick', () => {
    const noEggs = usableRecipes(MEALS, undefined, ['eggs'], foods).map((r) => r.id);
    expect(noEggs).not.toContain('bread-eggs');
    expect(noEggs).not.toContain('spaghetti-egg');
    expect(noEggs).toContain('rice-chicken');
    expect(usableRecipes(MEALS, ['akara-pap', 'groundnuts'], [], foods).map((r) => r.id)).toEqual(['akara-pap', 'groundnuts']);
  });
});

describe('daily plan', () => {
  it('has four meals near the calorie target', () => {
    const d = planDay({ date: monday, weekStart: monday, recipes: all, foods, targets });
    expect(d.meals.filter((m) => !m.extra).map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    expect(Math.abs(d.totals.kcal - targets.calories) / targets.calories).toBeLessThan(0.1);
    expect(d.scale % 0.25).toBe(0);
  });

  it('gives lunch and dinner different meals', () => {
    for (const d of planWeek({ weekStart: monday, recipes: all, foods, targets })) {
      const [lunch, dinner] = ['lunch', 'dinner'].map((s) => d.meals.find((m) => m.slot === s)!.recipe.id);
      expect(lunch).not.toBe(dinner);
    }
  });

  it('is deterministic and rotates through the week', () => {
    const a = planWeek({ weekStart: monday, recipes: all, foods, targets });
    const b = planWeek({ weekStart: monday, recipes: all, foods, targets });
    expect(a).toEqual(b);
    expect(new Set(a.map((d) => d.meals[0].recipe.id)).size).toBeGreaterThan(1);
  });

  it('applies a swap for one meal only', () => {
    const d = planDay({ date: monday, weekStart: monday, recipes: all, foods, targets, swaps: { [`${monday}:lunch`]: 'yam-porridge-fish' } });
    expect(d.meals.find((m) => m.slot === 'lunch')!.recipe.id).toBe('yam-porridge-fish');
  });

  it('tops up protein with eggs when short, and says so', () => {
    const lowProtein = usableRecipes(MEALS, ['akara-pap', 'beans-dodo', 'spaghetti-egg', 'banana', 'boiled-eggs'], [], foods);
    // Tuesday: the rotation picks banana as the snack, so eggs are a genuine top-up.
    const d = planDay({ date: '2026-10-27', weekStart: monday, recipes: lowProtein, foods, targets: { calories: 2750, proteinG: 160 } });
    expect(d.meals.some((m) => m.extra && m.recipe.id === 'boiled-eggs')).toBe(true);
    expect(d.notes.join(' ')).toMatch(/Added 2 boiled eggs/);
  });

  it('explains when a slot has nothing to choose from', () => {
    const d = planDay({ date: monday, weekStart: monday, recipes: usableRecipes(MEALS, ['rice-chicken'], [], foods), foods, targets });
    expect(d.notes.join(' ')).toMatch(/No breakfast you like/);
  });

  it('keeps portions within limits and reports a big calorie gap', () => {
    const d = planDay({ date: monday, weekStart: monday, recipes: usableRecipes(MEALS, ['banana'], [], foods), foods, targets });
    expect(d.scale).toBe(2);
    expect(d.notes.join(' ')).toMatch(/kcal under your target/);
  });
});

describe('shopping and cooking', () => {
  const week = planWeek({ weekStart: monday, recipes: all, foods, targets });

  it('totals the week in raw amounts, rounded up', () => {
    const list = shoppingList(week, foods);
    const rice = list.find((i) => i.name === 'Rice, white, raw');
    const exact = week.flatMap((d) => d.meals).flatMap((m) => m.lines).filter((l) => l.foodId === rice!.foodId).reduce((s, l) => s + l.grams, 0);
    expect(rice!.grams).toBeGreaterThanOrEqual(exact);
    expect(rice!.grams - exact).toBeLessThan(50);
  });

  it('splits cook-ahead batches into two sessions covering the whole week', () => {
    const sessions = cookAhead(week);
    expect(sessions.map((s) => s.days.length)).toEqual([3, 4]);
    const batchTotal = sessions.flatMap((s) => s.groups).flatMap((g) => g.items).reduce((s, i) => s + i.grams, 0);
    const weekBatch = week.flatMap((d) => d.meals).flatMap((m) => m.lines).filter((l) => l.batch).reduce((s, l) => s + l.grams, 0);
    expect(batchTotal).toBe(weekBatch);
  });
});
