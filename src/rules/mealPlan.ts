// Meal planning from recipes you like. Deterministic: the same week, targets and
// choices always give the same plan, so it can be tested and explained.

import { addDays, daysBetween, type ISODate } from './dates';
import { fitsPreferences, type AvoidCategory } from './foodPrefs';
import type { MealKind, MealRecipe } from '../seed/meals';

export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const SLOT_KIND: Record<Slot, MealKind> = { breakfast: 'breakfast', lunch: 'main', dinner: 'main', snack: 'snack' };
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface FoodMacros { id: string; name: string; kcal: number; proteinG: number; carbsG: number; fatG: number }
export interface Macros { kcal: number; proteinG: number; carbsG: number; fatG: number }

export interface PlannedMeal {
  /** Where it goes in the food log. A protein top-up is logged as a snack. */
  slot: Slot;
  /** Stable key for logging and swaps, e.g. "2026-10-26:lunch". */
  key: string;
  recipe: MealRecipe;
  /** Portion multiplier applied to the recipe, in quarter steps. */
  scale: number;
  lines: { foodId: string; grams: number; batch?: string }[];
  macros: Macros;
  extra?: boolean;
}

export interface DayPlan {
  date: ISODate;
  meals: PlannedMeal[];
  totals: Macros;
  targets: { calories: number; proteinG: number };
  scale: number;
  notes: string[];
}

export const MIN_SCALE = 0.75;
export const MAX_SCALE = 2;
const zero = (): Macros => ({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
const add = (a: Macros, b: Macros): Macros => ({ kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, carbsG: a.carbsG + b.carbsG, fatG: a.fatG + b.fatG });
const roundTo = (x: number, step: number) => Math.round(x / step) * step;

/** Recipes you like, minus any containing foods you don't eat. */
export function usableRecipes(recipes: MealRecipe[], liked: string[] | undefined, avoid: AvoidCategory[], foods: Map<string, FoodMacros>) {
  return recipes.filter((r) =>
    (!liked || liked.includes(r.id)) &&
    r.ingredients.every((i) => foods.has(i.foodId) && fitsPreferences(foods.get(i.foodId)!.name, avoid)),
  );
}

export function recipeMacros(r: MealRecipe, foods: Map<string, FoodMacros>, scale = 1): Macros {
  return r.ingredients.reduce((m, i) => {
    const f = foods.get(i.foodId);
    if (!f) return m;
    const k = (i.grams * scale) / 100;
    return add(m, { kcal: f.kcal * k, proteinG: f.proteinG * k, carbsG: f.carbsG * k, fatG: f.fatG * k });
  }, zero());
}

function planned(slot: Slot, date: ISODate, recipe: MealRecipe, scale: number, foods: Map<string, FoodMacros>, extra = false): PlannedMeal {
  return {
    slot, key: `${date}:${extra ? 'extra' : slot}`, recipe, scale, extra,
    lines: recipe.ingredients.map((i) => ({ foodId: i.foodId, grams: roundTo(i.grams * scale, 5), batch: i.batch })),
    macros: recipeMacros(recipe, foods, scale),
  };
}

/**
 * Picks meals for a day by rotating through what you like (lunch and dinner differ
 * when you like more than one main), applies swaps, then scales every portion by one
 * factor so the day lands near your calorie target. Adds eggs if protein falls short.
 */
export function planDay(o: {
  date: ISODate; weekStart: ISODate; recipes: MealRecipe[]; foods: Map<string, FoodMacros>;
  targets: { calories: number; proteinG: number }; swaps?: Record<string, string>;
}): DayPlan {
  const i = daysBetween(o.weekStart, o.date);
  const byKind = (k: MealKind) => o.recipes.filter((r) => r.kind === k);
  const notes: string[] = [];
  const pick = (slot: Slot): MealRecipe | undefined => {
    const swapped = o.swaps?.[`${o.date}:${slot}`];
    const options = byKind(SLOT_KIND[slot]);
    if (swapped) {
      const r = options.find((x) => x.id === swapped);
      if (r) return r;
    }
    if (!options.length) return undefined;
    const offset = slot === 'dinner' ? Math.max(1, Math.ceil(options.length / 2)) : 0;
    return options[(i + offset) % options.length];
  };

  const chosen = SLOTS.map((slot) => ({ slot, recipe: pick(slot) })).filter((x): x is { slot: Slot; recipe: MealRecipe } => !!x.recipe);
  for (const slot of SLOTS) if (!chosen.some((c) => c.slot === slot)) notes.push(`No ${slot === 'snack' ? 'snack' : slot} you like fits your food choices, so it's left empty.`);
  if (!chosen.length) return { date: o.date, meals: [], totals: zero(), targets: o.targets, scale: 1, notes };

  const base = chosen.reduce((m, c) => add(m, recipeMacros(c.recipe, o.foods)), zero());
  const raw = o.targets.calories / base.kcal;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, roundTo(raw, 0.25)));
  const meals = chosen.map((c) => planned(c.slot, o.date, c.recipe, scale, o.foods));
  let totals = meals.reduce((m, p) => add(m, p.macros), zero());

  if (totals.proteinG < o.targets.proteinG * 0.9) {
    const eggs = o.recipes.find((r) => r.id === 'boiled-eggs');
    if (eggs && !meals.some((m) => m.recipe.id === 'boiled-eggs')) {
      const extra = planned('snack', o.date, eggs, 1, o.foods, true);
      meals.push(extra);
      totals = add(totals, extra.macros);
      notes.push('Added 2 boiled eggs to get closer to your protein target.');
    }
  }
  const proteinGap = o.targets.proteinG - totals.proteinG;
  if (proteinGap > o.targets.proteinG * 0.1) notes.push(`About ${Math.round(proteinGap)} g short of your protein target. A bigger piece of meat or fish, or more beans, would close it.`);
  const kcalOff = (totals.kcal - o.targets.calories) / o.targets.calories;
  if (Math.abs(kcalOff) > 0.1) notes.push(`About ${Math.round(Math.abs(totals.kcal - o.targets.calories))} kcal ${kcalOff > 0 ? 'over' : 'under'} your target: portions only scale between ${MIN_SCALE}× and ${MAX_SCALE}×.`);

  return { date: o.date, meals, totals, targets: o.targets, scale, notes };
}

export function planWeek(o: Omit<Parameters<typeof planDay>[0], 'date'>): DayPlan[] {
  return Array.from({ length: 7 }, (_, n) => planDay({ ...o, date: addDays(o.weekStart, n) }));
}

export interface ShoppingItem { foodId: string; name: string; grams: number }

/** Total raw amounts to buy for the given days, rounded up to sensible shop amounts. */
export function shoppingList(days: DayPlan[], foods: Map<string, FoodMacros>): ShoppingItem[] {
  const totals = new Map<string, number>();
  for (const d of days) for (const m of d.meals) for (const l of m.lines) totals.set(l.foodId, (totals.get(l.foodId) ?? 0) + l.grams);
  return [...totals].map(([foodId, g]) => ({
    foodId, name: foods.get(foodId)?.name ?? foodId,
    grams: g >= 200 ? Math.ceil(g / 50) * 50 : Math.ceil(g / 10) * 10,
  })).sort((a, b) => b.grams - a.grams);
}

export interface CookSession { label: string; days: ISODate[]; groups: { group: string; items: { foodId: string; grams: number }[] }[] }

/**
 * Cook-ahead plan: two sessions a week, one for Monday–Wednesday and one for
 * Thursday–Sunday, with the raw amounts of each batch (rice, beans, stew, soup).
 */
export function cookAhead(days: DayPlan[]): CookSession[] {
  const sessions = [
    { label: 'Cook on Sunday (for Monday to Wednesday)', days: days.slice(0, 3) },
    { label: 'Cook on Wednesday evening (for Thursday to Sunday)', days: days.slice(3) },
  ];
  return sessions.map((s) => {
    const groups = new Map<string, Map<string, number>>();
    for (const d of s.days) for (const m of d.meals) for (const l of m.lines) {
      if (!l.batch) continue;
      const g = groups.get(l.batch) ?? new Map<string, number>();
      g.set(l.foodId, (g.get(l.foodId) ?? 0) + l.grams);
      groups.set(l.batch, g);
    }
    return {
      label: s.label, days: s.days.map((d) => d.date),
      groups: [...groups].map(([group, items]) => ({ group, items: [...items].map(([foodId, grams]) => ({ foodId, grams })) })),
    };
  });
}
