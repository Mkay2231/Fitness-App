// Local database (IndexedDB via Dexie). Everything is stored on this device,
// so logging works with no internet. Use Settings → Export to back it up.

import Dexie, { type EntityTable } from 'dexie';
import type { Activity, Sex } from './rules/nutrition';
import type { ISODate } from './rules/dates';
import type { AvoidCategory } from './rules/foodPrefs';
import type { CheckIn } from './rules/review';
import type { Experience, Limitation, Setting } from './rules/program';
import type { LengthUnit, WeightUnit } from './rules/units';

export type EquipmentKind = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';

export interface Settings {
  id: 'me';
  sex: Sex;
  age: number;
  heightCm: number;
  startWeightKg: number;
  activity: Activity;
  /** Goal as a weekly gain rate in % of body weight; 0 = recomposition (hold weight). */
  gainRatePctPerWeek: number;
  experience: Experience;
  setting: Setting;
  /** ISO weekdays you plan to train: 1 = Monday … 7 = Sunday. */
  trainingDays: number[];
  sessionMinutes: number;
  limitations: Limitation[];
  avoidFoods: AvoidCategory[];
  weightUnit: WeightUnit;
  lengthUnit: LengthUnit;
  /** Meal recipes you like (ids from seed/meals). Absent means all of them. */
  likedMeals?: string[];
  /** Smallest jump available per equipment type, kg. Edit once you know your gym. */
  increments: Record<EquipmentKind, number>;
  aiEnabled: boolean;
  createdAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  equipment: EquipmentKind;
  primary: string;
  secondary: string[];
  /** How-to steps, only when taken from a cited source. Absent means "not available". */
  instructions?: { steps: string[]; source: string; url: string };
  /** Weight logged is per dumbbell (true) or total (false). */
  perHand?: boolean;
}

export interface ProgramSlot {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  /** Why this slot differs from the template (experience, limitation, session length). */
  note?: string;
}

export interface ProgramDay {
  id: string;
  name: string;
  slots: ProgramSlot[];
}

export interface Program {
  id: string;
  name: string;
  setting: 'gym' | 'home';
  active: boolean;
  /** True once you've edited it; profile changes then warn before replacing your edits. */
  customised?: boolean;
  days: ProgramDay[];
  createdAt: string;
}

export interface Session {
  id?: number;
  programId: string;
  dayId: string;
  date: ISODate;
  startedAt: string;
  finishedAt: string | null;
  notes?: string;
  /** Exercises swapped for this session only: planned exercise id → exercise done instead. */
  swaps?: Record<string, string>;
}

export interface SetLog {
  id?: number;
  sessionId: number;
  exerciseId: string;
  date: ISODate;
  setIndex: number;
  weightKg: number | null;
  reps: number;
  rir: number | null;
  loggedAt: string;
}

export interface WeightLog {
  date: ISODate;
  kg: number;
}

export interface Measurement {
  id?: number;
  date: ISODate;
  site: string;
  cm: number;
}

export interface FoodSource {
  kind: 'reference' | 'label' | 'user';
  citation: string;
  url?: string;
}

export interface HouseholdMeasure {
  label: string;
  grams: number;
  /** Where this gram weight came from, e.g. "USDA portion" or "weighed by me". */
  basis: string;
}

export interface Food {
  id: string;
  name: string;
  /** Per 100 g of food as eaten. */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  measures: HouseholdMeasure[];
  source: FoodSource;
  builtIn: boolean;
}

/** A household measure you added to any food (kept apart so built-in updates never erase it). */
export interface UserMeasure {
  id?: number;
  foodId: string;
  label: string;
  grams: number;
  basis: 'weighed' | 'estimate';
}

/** A meal you swapped in the plan for one day; key like "2026-10-26:lunch". */
export interface PlanSwap {
  key: string;
  recipeId: string;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodEntry {
  id?: number;
  date: ISODate;
  slot: MealSlot;
  foodId: string;
  grams: number;
  /** What was typed, e.g. "2 × 1 cooking spoon", for display. */
  portionText: string;
  loggedAt: string;
  /** Set when logged from the meal plan: the planned meal's key, e.g. "2026-10-26:lunch". */
  fromPlan?: string;
}

export interface SavedMeal {
  id?: number;
  name: string;
  slot: MealSlot;
  items: { foodId: string; grams: number; portionText: string }[];
}

/** A day's food log is "not logged" unless a row exists here or entries exist. */
export interface FoodDay {
  date: ISODate;
  complete: boolean;
}

export interface TargetVersion {
  id?: number;
  effectiveFrom: ISODate;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  reasons: string[];
  createdAt: string;
}

export interface Decision {
  /** Recommendation key, e.g. "2026-10-19:calories". */
  key: string;
  /** accepted/rejected for plan changes; noted for suggested actions. */
  status: 'accepted' | 'rejected' | 'noted';
  title: string;
  reasons: string[];
  decidedAt: string;
}

export const db = new Dexie('rep-ledger') as Dexie & {
  settings: EntityTable<Settings, 'id'>;
  exercises: EntityTable<Exercise, 'id'>;
  programs: EntityTable<Program, 'id'>;
  sessions: EntityTable<Session, 'id'>;
  sets: EntityTable<SetLog, 'id'>;
  weights: EntityTable<WeightLog, 'date'>;
  measurements: EntityTable<Measurement, 'id'>;
  foods: EntityTable<Food, 'id'>;
  foodEntries: EntityTable<FoodEntry, 'id'>;
  savedMeals: EntityTable<SavedMeal, 'id'>;
  foodDays: EntityTable<FoodDay, 'date'>;
  targets: EntityTable<TargetVersion, 'id'>;
  decisions: EntityTable<Decision, 'key'>;
  measures: EntityTable<UserMeasure, 'id'>;
  checkins: EntityTable<CheckIn, 'date'>;
  planSwaps: EntityTable<PlanSwap, 'key'>;
};

db.version(1).stores({
  settings: 'id',
  exercises: 'id',
  programs: 'id, active',
  sessions: '++id, date, [programId+dayId], finishedAt',
  sets: '++id, sessionId, exerciseId, date',
  weights: 'date',
  measurements: '++id, date, site',
  foods: 'id, name',
  foodEntries: '++id, date',
  savedMeals: '++id, name',
  foodDays: 'date',
  targets: '++id, effectiveFrom',
  decisions: 'key',
});

db.version(2).stores({
  measures: '++id, foodId',
});

// v3: profile fields for experience, equipment, session length, limitations, food and units.
db.version(3).stores({}).upgrade(async (tx) => {
  const programs = await tx.table('programs').toArray();
  const active = programs.find((p) => p.active);
  await tx.table('settings').toCollection().modify((s) => {
    s.experience ??= 'new';
    s.setting ??= active?.setting ?? 'gym';
    s.sessionMinutes ??= 60;
    s.limitations ??= [];
    s.avoidFoods ??= [];
    s.weightUnit ??= 'kg';
    s.lengthUnit ??= 'cm';
  });
});

// v4: optional daily sleep, energy and soreness check-ins.
db.version(4).stores({ checkins: 'date' });

// v5: meal plan swaps.
db.version(5).stores({ planSwaps: 'key' });

/** Ask the browser not to clear this data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
