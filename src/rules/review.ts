// Builds the weekly review from saved records only. Missing data stays missing:
// it is reported as a gap, never counted as zero. Every suggestion carries the
// evidence it used and the rule that produced it.

import { addDays, daysBetween, isoWeekday, weekDates, type ISODate } from './dates';
import { adjustCalories, macrosFor, type Adjustment, type MacroTargets } from './nutrition';
import { comparePerformance, type PerformanceChange } from './performance';
import type { ExerciseSession } from './progression';
import { sevenDayAverage, weeklyRate, MIN_WEIGH_INS, TREND_WINDOW_DAYS, type WeighIn } from './trend';

export type FoodDayStatus = 'complete' | 'partial' | 'not-logged';

export interface FoodDaySummary {
  date: ISODate;
  status: FoodDayStatus;
  kcal: number;
  proteinG: number;
}

export interface CheckIn {
  date: ISODate;
  sleepHours: number | null;
  /** 1 (very low) – 5 (very high) */
  energy: number | null;
  /** 1 (none) – 5 (very sore) */
  soreness: number | null;
}

export interface MeasurementPoint { date: ISODate; cm: number }

export interface ReviewInput {
  weekStart: ISODate;
  /** Today. Days after it are upcoming, never missing. */
  asOf: ISODate;
  plannedWeekdays: number[];
  completedSessionDates: ISODate[];
  setsByMuscle: Record<string, number>;
  /** Exercises done in this week's finished sessions: the latest of them and the session before it. */
  exercises?: { exerciseId: string; name: string; latest: ExerciseSession; previous?: ExerciseSession }[];
  /** One entry per day for the 14 days ending on the review's last day. */
  foodDays: FoodDaySummary[];
  weighIns: WeighIn[];
  /** Per site: the newest measurement up to the review's end and the one before it. */
  measurements?: { site: string; latest: MeasurementPoint; previous?: MeasurementPoint }[];
  checkIns?: CheckIn[];
  targets: MacroTargets;
  gainRatePctPerWeek: number;
  fmtWeight?: (kg: number) => string;
  fmtRate?: (kgPerWeek: number) => string;
  fmtLength?: (cm: number) => string;
  fmtDay?: (iso: ISODate) => string;
}

export interface Recommendation {
  /** Stable id so a decision on it is remembered. */
  key: string;
  kind: 'calories' | 'protein' | 'hold' | 'adherence' | 'recovery';
  /** change: alters your plan, so you accept or reject it. action: something to do; you note it. */
  type: 'change' | 'action';
  title: string;
  /** The fixed rule that produced this suggestion, in plain words. */
  rule: string;
  /** The records it is based on. */
  evidence: string[];
  from?: number;
  to?: number;
}

export interface WeeklyReview {
  weekStart: ISODate;
  endDate: ISODate;
  training: { planned: ISODate[]; completed: ISODate[]; missed: ISODate[]; upcoming: ISODate[]; extra: ISODate[] };
  volume: { muscle: string; sets: number }[];
  performance: PerformanceChange[];
  nutrition: {
    week: FoodDaySummary[];
    completeDays: number;
    partialDays: number;
    notLoggedDays: number;
    /** Averages are only given with at least MIN_COMPLETE_DAYS complete days. */
    sufficient: boolean;
    avgKcal: number | null;
    avgProteinG: number | null;
    suspiciousDays: ISODate[];
  };
  weight: { avg7: number | null; prevAvg7: number | null; rateKgPerWeek: number | null; weighInsThisWeek: number; weighInsWindow: number };
  measurements: { site: string; latest: MeasurementPoint; previous?: MeasurementPoint }[];
  wellbeing: { entries: number; sleepAvg: number | null; energyAvg: number | null; sorenessAvg: number | null };
  calorieCheck: Adjustment;
  gaps: string[];
  conflicts: string[];
  recommendations: Recommendation[];
  summary: string[];
}

export const MIN_COMPLETE_DAYS = 4;
export const MIN_WEEKLY_WEIGH_INS = 4;
export const MIN_CHECK_INS = 3;
export const MAX_SUGGESTIONS = 3;
/** A day marked complete below this share of the calorie target is flagged as possibly incomplete. */
export const SUSPICIOUS_SHARE = 0.4;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function buildWeeklyReview(i: ReviewInput): WeeklyReview {
  const fw = i.fmtWeight ?? ((kg: number) => `${kg.toFixed(1)} kg`);
  const fr = i.fmtRate ?? ((kg: number) => `${kg >= 0 ? '+' : '−'}${Math.abs(kg).toFixed(2)} kg/week`);
  const fl = i.fmtLength ?? ((cm: number) => `${cm.toFixed(1)} cm`);
  const fd = i.fmtDay ?? ((d: ISODate) => d);

  const days = weekDates(i.weekStart);
  const endDate = days[6] < i.asOf ? days[6] : i.asOf;
  const done = new Set(i.completedSessionDates);

  // ---- Training
  const planned = days.filter((d) => i.plannedWeekdays.includes(isoWeekday(d)));
  const training = {
    planned,
    completed: planned.filter((d) => done.has(d)),
    // Today isn't "missed" until it's over.
    missed: planned.filter((d) => d <= endDate && d < i.asOf && !done.has(d)),
    upcoming: planned.filter((d) => d > endDate || (d === i.asOf && !done.has(d))),
    extra: days.filter((d) => done.has(d) && !planned.includes(d)),
  };
  const volume = Object.entries(i.setsByMuscle).map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets);
  const performance = (i.exercises ?? []).map((e) => comparePerformance(e.exerciseId, e.name, e.latest, e.previous, fw, fd));
  const ups = performance.filter((p) => p.status === 'up');
  const downs = performance.filter((p) => p.status === 'down');
  const compared = performance.filter((p) => p.status === 'up' || p.status === 'down' || p.status === 'flat');

  // ---- Nutrition
  const weekFood = days.filter((d) => d <= endDate).map(
    (d) => i.foodDays.find((f) => f.date === d) ?? { date: d, status: 'not-logged' as const, kcal: 0, proteinG: 0 },
  );
  const completeWeek = weekFood.filter((f) => f.status === 'complete');
  const sufficient = completeWeek.length >= MIN_COMPLETE_DAYS;
  const suspiciousDays = completeWeek.filter((f) => f.kcal > 0 && f.kcal < i.targets.calories * SUSPICIOUS_SHARE).map((f) => f.date);
  const nutrition = {
    week: weekFood,
    completeDays: completeWeek.length,
    partialDays: weekFood.filter((f) => f.status === 'partial').length,
    notLoggedDays: weekFood.filter((f) => f.status === 'not-logged').length,
    sufficient,
    avgKcal: sufficient ? avg(completeWeek.map((f) => f.kcal)) : null,
    avgProteinG: sufficient ? avg(completeWeek.map((f) => f.proteinG)) : null,
    suspiciousDays,
  };

  // ---- Body
  const windowStart = addDays(endDate, -(TREND_WINDOW_DAYS - 1));
  const weight = {
    avg7: sevenDayAverage(i.weighIns, endDate),
    prevAvg7: sevenDayAverage(i.weighIns, addDays(endDate, -7)),
    rateKgPerWeek: weeklyRate(i.weighIns, endDate),
    weighInsThisWeek: i.weighIns.filter((w) => w.date >= i.weekStart && w.date <= endDate).length,
    weighInsWindow: i.weighIns.filter((w) => w.date >= windowStart && w.date <= endDate).length,
  };
  const measurements = i.measurements ?? [];
  const checks = (i.checkIns ?? []).filter((c) => c.date >= i.weekStart && c.date <= endDate);
  const wellbeing = {
    entries: checks.length,
    sleepAvg: avg(nums(checks.map((c) => c.sleepHours))),
    energyAvg: avg(nums(checks.map((c) => c.energy))),
    sorenessAvg: avg(nums(checks.map((c) => c.soreness))),
  };

  // ---- Calorie rule (14-day window)
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

  // ---- Missing data
  const gaps: string[] = [];
  if (weight.weighInsThisWeek < MIN_WEEKLY_WEIGH_INS) gaps.push(`${plural(weight.weighInsThisWeek, 'weigh-in')} this week. ${MIN_WEEKLY_WEIGH_INS}+ mornings make the average dependable.`);
  if (weight.rateKgPerWeek === null) gaps.push(`No weight trend yet: it needs ${MIN_WEIGH_INS} weigh-ins spread over 10+ days (you have ${weight.weighInsWindow} in the last 14 days).`);
  if (!sufficient) gaps.push(`${plural(completeWeek.length, 'complete food day')} this week; averages need ${MIN_COMPLETE_DAYS}, so none are shown.`);
  if (nutrition.partialDays) gaps.push(`${plural(nutrition.partialDays, 'day')} with food logged but not marked complete, so left out of averages.`);
  if (suspiciousDays.length) gaps.push(`Marked complete but under ${Math.round(SUSPICIOUS_SHARE * 100)}% of your calorie target: ${suspiciousDays.map(fd).join(', ')}. If entries are missing, mark ${suspiciousDays.length === 1 ? 'it' : 'them'} incomplete.`);
  if (training.missed.length) gaps.push(`No finished workout on ${plural(training.missed.length, 'planned day')}: ${training.missed.map(fd).join(', ')}. If you trained but didn't log, it isn't counted.`);
  if (performance.some((p) => p.status === 'new')) gaps.push(`${plural(performance.filter((p) => p.status === 'new').length, 'exercise')} with no earlier session to compare with.`);
  if (wellbeing.entries === 0) gaps.push('No sleep, energy or soreness check-ins this week (optional).');
  const lastMeasure = measurements.map((m) => m.latest.date).sort().at(-1);
  if (!lastMeasure || daysBetween(lastMeasure, endDate) > 28) gaps.push('No measurements in the last 4 weeks (optional, every 2–4 weeks).');

  // ---- Conflicting or uncertain signals
  const conflicts: string[] = [];
  const targetRate = currentWeight !== null ? (currentWeight * i.gainRatePctPerWeek) / 100 : null;
  if (weight.rateKgPerWeek !== null && targetRate !== null && weight.rateKgPerWeek > targetRate + 0.1 && compared.length >= 2 && ups.length === 0) {
    conflicts.push(`Weight is rising faster than planned (${fr(weight.rateKgPerWeek)}) but none of ${compared.length} compared lifts improved. Extra scale weight without extra strength is more likely water or fat than muscle.`);
  }
  if (weight.rateKgPerWeek !== null && weight.rateKgPerWeek <= 0 && ups.length >= 2) {
    conflicts.push(`${ups.length} lifts improved while weight held or fell (${fr(weight.rateKgPerWeek)}). Early strength gains come partly from skill, so this doesn't prove muscle was gained or lost. The calorie rule still follows your weight goal.`);
  }
  if (nutrition.avgKcal !== null && weight.rateKgPerWeek !== null && nutrition.avgKcal > i.targets.calories + 200 && weight.rateKgPerWeek < 0) {
    conflicts.push(`Logged intake averaged above target (${Math.round(nutrition.avgKcal)} kcal) yet weight fell. Logs may be missing items or portions may be underestimated.`);
  }
  if (downs.length >= 2 && wellbeing.entries >= MIN_CHECK_INS && (wellbeing.sleepAvg ?? 9) >= 7 && (wellbeing.sorenessAvg ?? 1) < 4) {
    conflicts.push(`${downs.length} lifts dropped even though sleep and soreness check-ins look fine. One week can be noise; watch next week before changing anything.`);
  }

  // ---- Suggestions (at most MAX_SUGGESTIONS, plan changes first)
  const recs: Recommendation[] = [];
  const caloriesRule = 'Calories change only when the 14-day weight trend misses your goal by more than 0.1 kg a week, with 8+ weigh-ins over 10+ days and 10+ complete food days. Each step is capped at ±250 kcal.';
  if (calorieCheck.kind === 'change') {
    recs.push({
      key: `${i.weekStart}:calories`, kind: 'calories', type: 'change',
      title: `Change daily calories from ${calorieCheck.fromCalories} to ${calorieCheck.toCalories} kcal`,
      rule: caloriesRule, evidence: calorieCheck.reasons, from: calorieCheck.fromCalories, to: calorieCheck.toCalories,
    });
  }
  if (weight.avg7 !== null) {
    const protein = macrosFor(i.targets.calories, weight.avg7).proteinG;
    if (Math.abs(protein - i.targets.proteinG) >= 10) {
      recs.push({
        key: `${i.weekStart}:protein`, kind: 'protein', type: 'change',
        title: `Change daily protein from ${i.targets.proteinG} to ${protein} g`,
        rule: 'Protein is 1.8 g per kg of your 7-day average weight, updated when that differs from the current target by 10 g or more.',
        evidence: [`7-day average weight ${fw(weight.avg7)} × 1.8 g/kg = ${protein} g; current target ${i.targets.proteinG} g.`],
        from: i.targets.proteinG, to: protein,
      });
    }
  }
  if (calorieCheck.kind === 'insufficient-data') {
    recs.push({
      key: `${i.weekStart}:hold`, kind: 'hold', type: 'action',
      title: 'Keep your plan as it is and keep logging',
      rule: 'When there are too few records, the plan stays the same and the next step is collecting more data, rather than guessing.',
      evidence: [...calorieCheck.reasons, ...(sufficient ? [] : [`${plural(completeWeek.length, 'complete food day')} this week.`])],
    });
  } else if (calorieCheck.kind === 'no-change') {
    recs.push({
      key: `${i.weekStart}:hold`, kind: 'hold', type: 'action',
      title: 'Keep your calorie target as it is',
      rule: caloriesRule, evidence: calorieCheck.reasons,
    });
  }
  if (training.missed.length) {
    recs.push({
      key: `${i.weekStart}:adherence`, kind: 'adherence', type: 'action',
      title: `Protect your training days next week (${training.completed.length + training.extra.length} of ${planned.length} done)`,
      rule: 'A planned day with no finished workout counts as missed. The programme rotates, so your next workout continues where you stopped, and nothing needs making up.',
      evidence: [`Planned: ${planned.map(fd).join(', ')}.`, `Not logged: ${training.missed.map(fd).join(', ')}.`],
    });
  }
  if (downs.length >= 2) {
    const lowRecovery = wellbeing.entries >= MIN_CHECK_INS && ((wellbeing.sleepAvg ?? 9) < 7 || (wellbeing.sorenessAvg ?? 1) >= 4);
    if (lowRecovery) {
      recs.push({
        key: `${i.weekStart}:recovery`, kind: 'recovery', type: 'action',
        title: 'Prioritise sleep and recovery this week',
        rule: 'Two or more lifts dropped while sleep averaged under 7 hours or soreness 4+ out of 5. Progression already holds or lowers the weight where reps fell.',
        evidence: [...downs.map((d) => `${d.name}: ${d.evidence}`), `Sleep ${wellbeing.sleepAvg?.toFixed(1) ?? '–'} h, soreness ${wellbeing.sorenessAvg?.toFixed(1) ?? '–'}/5 over ${plural(wellbeing.entries, 'check-in')}.`],
      });
    } else if (wellbeing.entries < MIN_CHECK_INS) {
      recs.push({
        key: `${i.weekStart}:recovery`, kind: 'recovery', type: 'action',
        title: 'Log sleep and energy for a few days',
        rule: `Two or more lifts dropped and there are fewer than ${MIN_CHECK_INS} check-ins, so recovery can't be ruled in or out.`,
        evidence: downs.map((d) => `${d.name}: ${d.evidence}`),
      });
    }
  }
  const recommendations = recs.slice(0, MAX_SUGGESTIONS);

  // ---- Plain summary, built only from the numbers above (no AI)
  const summary: string[] = [];
  summary.push(`You finished ${training.completed.length + training.extra.length} of ${plural(planned.length, 'planned session')}${training.upcoming.length ? ` (${training.upcoming.length} still to come)` : ''}.`);
  if (compared.length) summary.push(`Compared with each exercise's previous session: ${ups.length} up, ${compared.length - ups.length - downs.length} about the same, ${downs.length} down.`);
  else if (performance.length) summary.push('No lifts could be compared yet; this week sets the baseline.');
  if (weight.avg7 !== null) summary.push(`7-day average weight ${fw(weight.avg7)}${weight.rateKgPerWeek !== null ? `, trend ${fr(weight.rateKgPerWeek)}` : ', not enough weigh-ins for a trend'}.`);
  else summary.push('No weigh-ins this week.');
  if (nutrition.avgKcal !== null) summary.push(`Average on ${plural(completeWeek.length, 'complete day')}: ${Math.round(nutrition.avgKcal)} kcal and ${Math.round(nutrition.avgProteinG!)} g protein (targets ${i.targets.calories} kcal, ${i.targets.proteinG} g).`);
  else summary.push(`Not enough complete food days for averages (${completeWeek.length} of ${MIN_COMPLETE_DAYS} needed).`);
  if (wellbeing.sleepAvg !== null) summary.push(`Sleep averaged ${wellbeing.sleepAvg.toFixed(1)} h over ${plural(wellbeing.entries, 'check-in')}.`);
  for (const m of measurements.filter((m) => m.latest.date >= i.weekStart && m.previous)) {
    summary.push(`${m.site}: ${fl(m.latest.cm)} (${m.latest.cm - m.previous!.cm >= 0 ? '+' : '−'}${fl(Math.abs(m.latest.cm - m.previous!.cm))} since ${fd(m.previous!.date)}).`);
  }

  return { weekStart: i.weekStart, endDate, training, volume, performance, nutrition, weight, measurements, wellbeing, calorieCheck, gaps, conflicts, recommendations, summary };
}
