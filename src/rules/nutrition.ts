// Starting calorie/macro estimates and rule-based adjustments.
// Every function returns its reasoning so the UI can show why.

export type Sex = 'male' | 'female';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'high';

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  /** Target weight gain as % of body weight per week (beginners: 0.25–0.5). */
  gainRatePctPerWeek: number;
}

export interface MacroTargets {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/** Activity factors applied to resting energy (common Mifflin-St Jeor multipliers). */
export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2, // desk job, little walking
  light: 1.375, // some walking, training 1–3 days
  moderate: 1.55, // on your feet a lot, or training 3–5 days
  high: 1.725, // physical job plus training
};

/** Rough energy content of a kg of body-weight change; a planning constant, not a law. */
export const KCAL_PER_KG = 7700;
export const PROTEIN_G_PER_KG = 1.8;
export const FAT_SHARE = 0.25;
export const MIN_FAT_G_PER_KG = 0.6;

export const roundTo = (x: number, step: number) => Math.round(x / step) * step;

/** Mifflin-St Jeor resting energy expenditure, kcal/day. */
export function restingEnergy(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return base + (p.sex === 'male' ? 5 : -161);
}

export function maintenanceEstimate(p: Profile): number {
  return restingEnergy(p) * ACTIVITY_FACTORS[p.activity];
}

/** kcal/day surplus needed for the chosen gain rate. */
export function surplusFor(p: Pick<Profile, 'weightKg' | 'gainRatePctPerWeek'>): number {
  const kgPerWeek = (p.weightKg * p.gainRatePctPerWeek) / 100;
  return (kgPerWeek * KCAL_PER_KG) / 7;
}

export function macrosFor(calories: number, weightKg: number): MacroTargets {
  const proteinG = roundTo(weightKg * PROTEIN_G_PER_KG, 5);
  const fatG = roundTo(Math.max((calories * FAT_SHARE) / 9, weightKg * MIN_FAT_G_PER_KG), 5);
  const carbsG = roundTo(Math.max(0, (calories - proteinG * 4 - fatG * 9) / 4), 5);
  return { calories, proteinG, fatG, carbsG };
}

export function initialTargets(p: Profile): { targets: MacroTargets; reasons: string[] } {
  const ree = restingEnergy(p);
  const maintenance = ree * ACTIVITY_FACTORS[p.activity];
  const surplus = surplusFor(p);
  const calories = roundTo(maintenance + surplus, 50);
  const targets = macrosFor(calories, p.weightKg);
  const kgPerWeek = (p.weightKg * p.gainRatePctPerWeek) / 100;
  return {
    targets,
    reasons: [
      `Resting energy ≈ ${Math.round(ree)} kcal (Mifflin-St Jeor equation from your sex, age, height and weight).`,
      `× ${ACTIVITY_FACTORS[p.activity]} for "${p.activity}" activity ≈ ${Math.round(maintenance)} kcal to maintain weight.`,
      `+ ${Math.round(surplus)} kcal to gain about ${kgPerWeek.toFixed(2)} kg/week (${p.gainRatePctPerWeek}% of body weight).`,
      `Protein ${PROTEIN_G_PER_KG} g per kg body weight; fat about ${FAT_SHARE * 100}% of calories; carbs fill the rest.`,
      'This is a starting estimate. Your logged weight and food will show your real maintenance after 2–3 weeks.',
    ],
  };
}

export interface AdjustmentInput {
  currentCalories: number;
  weightKg: number;
  gainRatePctPerWeek: number;
  /** Measured trend in kg/week, or null if there is not enough weigh-in data. */
  trendKgPerWeek: number | null;
  /** Days in the trend window marked "complete" for food logging. */
  completeFoodDays: number;
  /** Average intake on complete days in the trend window, or null. */
  avgIntakeKcal: number | null;
}

export type Adjustment =
  | { kind: 'insufficient-data'; reasons: string[] }
  | { kind: 'no-change'; reasons: string[] }
  | { kind: 'change'; fromCalories: number; toCalories: number; reasons: string[] };

export const MIN_COMPLETE_FOOD_DAYS = 10;
export const RATE_TOLERANCE_KG = 0.1;
export const MAX_STEP_KCAL = 250;

/**
 * Suggests a calorie change from the measured weight trend versus the goal.
 * It only fires with enough data, and moves by at most MAX_STEP_KCAL.
 */
export function adjustCalories(i: AdjustmentInput): Adjustment {
  const target = (i.weightKg * i.gainRatePctPerWeek) / 100;
  if (i.trendKgPerWeek === null) {
    return { kind: 'insufficient-data', reasons: ['Need at least 8 weigh-ins over 10+ days to measure your weight trend.'] };
  }
  if (i.completeFoodDays < MIN_COMPLETE_FOOD_DAYS) {
    return {
      kind: 'insufficient-data',
      reasons: [`Only ${i.completeFoodDays} fully logged food days in the last 14; need ${MIN_COMPLETE_FOOD_DAYS} to trust the comparison.`],
    };
  }
  const diff = target - i.trendKgPerWeek;
  const trendText = `Weight trend ${fmtRate(i.trendKgPerWeek)} vs goal ${fmtRate(target)}`;
  const intakeText = i.avgIntakeKcal !== null
    ? `Average intake on complete days: ${Math.round(i.avgIntakeKcal)} kcal (target ${i.currentCalories}).`
    : '';
  if (Math.abs(diff) < RATE_TOLERANCE_KG) {
    return { kind: 'no-change', reasons: [`${trendText}: within ±${RATE_TOLERANCE_KG} kg/week, so keep calories.`, intakeText].filter(Boolean) };
  }
  // If intake is well off target, fix adherence before changing the target.
  if (i.avgIntakeKcal !== null && Math.abs(i.avgIntakeKcal - i.currentCalories) > 200) {
    return {
      kind: 'no-change',
      reasons: [
        `${trendText}.`,
        intakeText,
        'Intake is more than 200 kcal away from target, so the target is not the problem yet. Aim to hit it first.',
      ],
    };
  }
  const raw = (diff * KCAL_PER_KG) / 7;
  const step = roundTo(Math.max(-MAX_STEP_KCAL, Math.min(MAX_STEP_KCAL, raw)), 50);
  const toCalories = i.currentCalories + step;
  return {
    kind: 'change',
    fromCalories: i.currentCalories,
    toCalories,
    reasons: [
      `${trendText}.`,
      intakeText,
      `${diff > 0 ? 'Gaining slower' : 'Gaining faster'} than planned by ${Math.abs(diff).toFixed(2)} kg/week ≈ ${Math.round(Math.abs(raw))} kcal/day.`,
      `Suggest ${step > 0 ? '+' : ''}${step} kcal (changes are capped at ±${MAX_STEP_KCAL} kcal per review).`,
    ].filter(Boolean),
  };
}

export const fmtRate = (kg: number) => `${kg >= 0 ? '+' : ''}${kg.toFixed(2)} kg/week`;
