// Reads and writes for the meal plan: builds plans from your profile and targets,
// logs a planned meal in one step, and remembers swaps.

import { db, type MealSlot } from './db';
import { nowISO, targetsOn } from './data';
import { addDays, weekStart, type ISODate } from './rules/dates';
import { planDay, planWeek, usableRecipes, type DayPlan, type FoodMacros, type PlannedMeal, type Slot } from './rules/mealPlan';
import { MEALS } from './seed/meals';

export async function planContext(date: ISODate) {
  const settings = await db.settings.get('me');
  const targets = await targetsOn(date) ?? (await db.targets.orderBy('effectiveFrom').first());
  const foods = new Map<string, FoodMacros>((await db.foods.toArray()).map((f) => [f.id, f]));
  const monday = weekStart(date);
  const swaps = Object.fromEntries((await db.planSwaps.where('key').between(`${monday}:`, `${addDays(monday, 7)}:`, true, false).toArray()).map((s) => [s.key, s.recipeId]));
  const recipes = usableRecipes(MEALS, settings?.likedMeals, settings?.avoidFoods ?? [], foods);
  return { settings, targets, foods, monday, swaps, recipes };
}

export async function dayPlan(date: ISODate): Promise<{ plan: DayPlan | null; logged: Set<string>; options: Record<Slot, typeof MEALS> }> {
  const c = await planContext(date);
  const empty = { breakfast: [], lunch: [], dinner: [], snack: [] };
  if (!c.targets) return { plan: null, logged: new Set(), options: empty };
  const plan = planDay({ date, weekStart: c.monday, recipes: c.recipes, foods: c.foods, targets: { calories: c.targets.calories, proteinG: c.targets.proteinG }, swaps: c.swaps });
  const logged = new Set((await db.foodEntries.where('date').equals(date).toArray()).map((e) => e.fromPlan).filter((k): k is string => !!k));
  const byKind = (k: string) => c.recipes.filter((r) => r.kind === k);
  return { plan, logged, options: { breakfast: byKind('breakfast'), lunch: byKind('main'), dinner: byKind('main'), snack: byKind('snack') } };
}

export async function weekPlan(monday: ISODate) {
  const c = await planContext(monday);
  if (!c.targets) return null;
  const days = planWeek({ weekStart: monday, recipes: c.recipes, foods: c.foods, targets: { calories: c.targets.calories, proteinG: c.targets.proteinG }, swaps: c.swaps });
  return { days, foods: c.foods };
}

export const portionLabel = (scale: number) => {
  const whole = Math.floor(scale);
  const frac = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' }[scale - whole as 0 | 0.25 | 0.5 | 0.75] ?? '';
  return `${whole || ''}${frac || (whole ? '' : '0')} portion${scale === 1 ? '' : 's'}`;
};

/** Adds every ingredient of a planned meal to the food log for that day, in one transaction. */
export async function logPlannedMeal(date: ISODate, meal: PlannedMeal) {
  const slot: MealSlot = meal.slot;
  const loggedAt = nowISO();
  await db.foodEntries.bulkAdd(meal.lines.map((l) => ({
    date, slot, foodId: l.foodId, grams: l.grams, loggedAt, fromPlan: meal.key,
    portionText: `${meal.recipe.name} (${portionLabel(meal.scale)})`,
  })));
}

export async function unlogPlannedMeal(date: ISODate, key: string) {
  const ids = (await db.foodEntries.where('date').equals(date).toArray()).filter((e) => e.fromPlan === key).map((e) => e.id!);
  await db.foodEntries.bulkDelete(ids);
}

export async function swapPlannedMeal(date: ISODate, slot: Slot, recipeId: string) {
  await db.planSwaps.put({ key: `${date}:${slot}`, recipeId });
}
