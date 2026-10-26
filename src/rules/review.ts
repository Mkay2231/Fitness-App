// Builds the weekly review from recorded data only. Missing data stays
// missing: it is reported as "not logged", never counted as zero.

import { addDays, isoWeekday, weekDates, type ISODate } from './dates';
import { adjustCalories, macrosFor, type Adjustment, type MacroTargets } from './nutrition';
import { sevenDayAverage, weeklyRate, TREND_WINDOW_DAYS, type WeighIn } from './trend';

export type FoodDayStatus = 'complete' | 'partial' | 'not-logged';

export interface FoodDaySummary {
  date: ISODate;
  status: FoodDayStatus;
  kcal: number;
  proteinG: number;
}

export interface ReviewInput {
  weekStart: ISODate;
  /** Last day with data to consider (usually today, or Sunday for past weeks). */
  asOf: ISODate;
  plannedWeekdays: number[];
  completedSessionDates: ISODate[];
  setsByMuscle: Record<string, number>;
  /** One entry per day for the 14 days ending on the review's last day. */
  foodDays: FoodDaySummary[];
  weighIns: WeighIn[];
  targets: MacroTargets;
  gainRatePctPerWeek: number;
}

export interface Recommendation {
  /** Stable id so a decision on it is remembered. */
  key: string;
  kind: 'calories' | 'protein';
  title: string;
  from: number;
  to: number;
  reasons: string[];
}

export interface WeeklyReview {
  weekStart: ISODate;
  endDate: ISODate;
  training: { planned: ISODate[]; completed: ISODate[]; missed: ISODate[]; upcoming: ISODate[]; extra: ISODate[] };
  volume: { muscle: string; sets: number }[];
  nutrition: {
    week: FoodDaySummary[];
    completeDays: number;
    partialDays: number;
    notLoggedDays: number;
    avgKcal: number | null;
    avgProteinG: number | null;
  };
  weight: { avg7: number | null; prevAvg7: number | null; rateKgPerWeek: number | null; weighInsThisWeek: number };
  calorieCheck: Adjustment;
  recommendations: Recommendation[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function buildWeeklyReview(i: ReviewInput): WeeklyReview {
  const days = weekDates(i.weekStart);
  const endDate = days[6] < i.asOf ? days[6] : i.asOf;
  const done = new Set(i.completedSessionDates);

  const planned = days.filter((d) => i.plannedWeekdays.includes(isoWeekday(d)));
  const training = {
    planned,
    completed: planned.filter((d) => done.has(d)),
    missed: planned.filter((d) => d <= endDate && !done.has(d)),
    upcoming: planned.filter((d) => d > endDate),
    extra: days.filter((d) => done.has(d) && !planned.includes(d)),
  };

  const volume = Object.entries(i.setsByMuscle)
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);

  const weekFood = days.filter((d) => d <= endDate).map(
    (d) => i.foodDays.find((f) => f.date === d) ?? { date: d, status: 'not-logged' as const, kcal: 0, proteinG: 0 },
  );
  const completeWeek = weekFood.filter((f) => f.status === 'complete');
  const nutrition = {
    week: weekFood,
    completeDays: completeWeek.length,
    partialDays: weekFood.filter((f) => f.status === 'partial').length,
    notLoggedDays: weekFood.filter((f) => f.status === 'not-logged').length,
    avgKcal: avg(completeWeek.map((f) => f.kcal)),
    avgProteinG: avg(completeWeek.map((f) => f.proteinG)),
  };

  const weight = {
    avg7: sevenDayAverage(i.weighIns, endDate),
    prevAvg7: sevenDayAverage(i.weighIns, addDays(endDate, -7)),
    rateKgPerWeek: weeklyRate(i.weighIns, endDate),
    weighInsThisWeek: i.weighIns.filter((w) => w.date >= i.weekStart && w.date <= endDate).length,
  };

  const windowStart = addDays(endDate, -(TREND_WINDOW_DAYS - 1));
  const windowComplete = i.foodDays.filter((f) => f.status === 'complete' && f.date >= windowStart && f.date <= endDate);
  const currentWeight = weight.avg7 ?? i.weighIns.at(-1)?.kg ?? null;

  const calorieCheck: Adjustment = currentWeight === null
    ? { kind: 'insufficient-data', reasons: ['No weigh-ins recorded yet.'] }
    : adjustCalories({
        currentCalories: i.targets.calories,
        weightKg: currentWeight,
        gainRatePctPerWeek: i.gainRatePctPerWeek,
        trendKgPerWeek: weight.rateKgPerWeek,
        completeFoodDays: windowComplete.length,
        avgIntakeKcal: avg(windowComplete.map((f) => f.kcal)),
      });

  const recommendations: Recommendation[] = [];
  if (calorieCheck.kind === 'change') {
    recommendations.push({
      key: `${i.weekStart}:calories`,
      kind: 'calories',
      title: `Change daily calories ${calorieCheck.fromCalories} → ${calorieCheck.toCalories} kcal`,
      from: calorieCheck.fromCalories,
      to: calorieCheck.toCalories,
      reasons: calorieCheck.reasons,
    });
  }
  if (weight.avg7 !== null) {
    const protein = macrosFor(i.targets.calories, weight.avg7).proteinG;
    if (Math.abs(protein - i.targets.proteinG) >= 10) {
      recommendations.push({
        key: `${i.weekStart}:protein`,
        kind: 'protein',
        title: `Update protein ${i.targets.proteinG} → ${protein} g/day`,
        from: i.targets.proteinG,
        to: protein,
        reasons: [`Your 7-day average weight is now ${weight.avg7.toFixed(1)} kg; 1.8 g/kg gives ${protein} g.`],
      });
    }
  }

  return { weekStart: i.weekStart, endDate, training, volume, nutrition, weight, calorieCheck, recommendations };
}
