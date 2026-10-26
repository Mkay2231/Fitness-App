// Local database (IndexedDB via Dexie). Everything is stored on this device,
// so logging works with no internet. Use Settings → Export to back it up.

import Dexie, { type EntityTable } from 'dexie';
import type { Activity, Sex } from './rules/nutrition';
import type { ISODate } from './rules/dates';

export type EquipmentKind = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';

export interface Settings {
  id: 'me';
  sex: Sex;
  age: number;
  heightCm: number;
  startWeightKg: number;
  activity: Activity;
  gainRatePctPerWeek: number;
  /** ISO weekdays you plan to train: 1 = Monday … 7 = Sunday. */
  trainingDays: number[];
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
  cues: string[];
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
  status: 'accepted' | 'rejected';
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

/** Ask the browser not to clear this data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
