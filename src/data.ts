// Reads and writes that combine the database with the rules engine.

import { db, type Exercise, type FoodEntry, type Program, type ProgramSlot, type SetLog, type Settings, type TargetVersion } from './db';
import { addDays, toISODate, weekDates, type ISODate } from './rules/dates';
import { FAT_SHARE, MIN_FAT_G_PER_KG, roundTo } from './rules/nutrition';
import { suggestNext, type ExerciseSession, type Prescription } from './rules/progression';
import { buildWeeklyReview, type FoodDaySummary } from './rules/review';
import { setsByMuscle } from './rules/volume';
import { EXERCISES } from './seed/exercises';
import { FOODS } from './seed/foods';
import { PROGRAM_TEMPLATES } from './seed/programs';

export const today = (): ISODate => toISODate(new Date());
export const nowISO = () => new Date().toISOString();

/** Adds/updates built-in exercises and foods. Never touches your own data. */
export async function syncBuiltIns() {
  await db.transaction('rw', db.exercises, db.foods, async () => {
    await db.exercises.bulkPut(EXERCISES);
    await db.foods.bulkPut(FOODS);
  });
}

export async function activateProgram(templateId: string) {
  const t = PROGRAM_TEMPLATES.find((p) => p.id === templateId);
  if (!t) throw new Error(`Unknown program ${templateId}`);
  await db.transaction('rw', db.programs, async () => {
    const existing = await db.programs.toArray();
    await db.programs.bulkPut(existing.map((p) => ({ ...p, active: false })));
    const prev = existing.find((p) => p.id === t.id);
    await db.programs.put({ ...(prev ?? { ...t, createdAt: nowISO() }), active: true });
  });
}

export async function getActiveProgram(): Promise<Program | undefined> {
  return (await db.programs.toArray()).find((p) => p.active);
}

/** Alternates A/B: the day after the last finished session of this program. */
export async function nextProgramDay(program: Program) {
  const finished = await db.sessions.filter((s) => s.programId === program.id && s.finishedAt !== null).toArray();
  finished.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  const last = finished[0];
  const idx = last ? program.days.findIndex((d) => d.id === last.dayId) : -1;
  return program.days[(idx + 1) % program.days.length];
}

export async function openSession() {
  return db.sessions.filter((s) => s.finishedAt === null).first();
}

export async function startSession(program: Program, dayId: string): Promise<number> {
  const open = await openSession();
  if (open?.id) return open.id;
  return (await db.sessions.add({ programId: program.id, dayId, date: today(), startedAt: nowISO(), finishedAt: null })) as number;
}

/** This exercise's past sessions (finished ones only), most recent first. */
export async function exerciseHistory(exerciseId: string, excludeSessionId?: number): Promise<ExerciseSession[]> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray();
  const finished = new Map((await db.sessions.filter((s) => s.finishedAt !== null).toArray()).map((s) => [s.id as number, s]));
  const bySession = new Map<number, { date: ISODate; startedAt: string; sets: SetLog[] }>();
  for (const s of sets) {
    const session = finished.get(s.sessionId);
    if (s.sessionId === excludeSessionId || !session) continue;
    const entry = bySession.get(s.sessionId) ?? { date: session.date, startedAt: session.startedAt, sets: [] };
    entry.sets.push(s);
    bySession.set(s.sessionId, entry);
  }
  return [...bySession.values()]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .map((e) => ({ date: e.date, sets: e.sets.sort((a, b) => a.setIndex - b.setIndex) }));
}

export function prescriptionFor(slot: ProgramSlot, exercise: Exercise, settings: Settings): Prescription {
  return {
    sets: slot.sets,
    repMin: slot.repMin,
    repMax: slot.repMax,
    targetRir: slot.targetRir,
    increment: exercise.equipment === 'bodyweight' ? 0 : settings.increments[exercise.equipment],
  };
}

export async function suggestionFor(slot: ProgramSlot, exercise: Exercise, settings: Settings, excludeSessionId?: number) {
  const history = await exerciseHistory(exercise.id, excludeSessionId);
  return { suggestion: suggestNext(prescriptionFor(slot, exercise, settings), history), last: history[0] };
}

// ---------- Nutrition ----------

export async function targetsOn(date: ISODate): Promise<TargetVersion | undefined> {
  const all = await db.targets.where('effectiveFrom').belowOrEqual(date).toArray();
  return all.sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? (b.id ?? 0) - (a.id ?? 0) : a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
}

/** New target version keeping protein (or calories) and refilling fat/carbs. */
export function retarget(cur: Pick<TargetVersion, 'calories' | 'proteinG'>, change: { calories?: number; proteinG?: number }, weightKg: number) {
  const calories = change.calories ?? cur.calories;
  const proteinG = change.proteinG ?? cur.proteinG;
  const fatG = roundTo(Math.max((calories * FAT_SHARE) / 9, weightKg * MIN_FAT_G_PER_KG), 5);
  const carbsG = roundTo(Math.max(0, (calories - proteinG * 4 - fatG * 9) / 4), 5);
  return { calories, proteinG, fatG, carbsG };
}

export interface Totals { kcal: number; proteinG: number; carbsG: number; fatG: number }

export async function totalsFor(entries: FoodEntry[]): Promise<Totals> {
  const foods = new Map((await db.foods.toArray()).map((f) => [f.id, f]));
  const t: Totals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const e of entries) {
    const f = foods.get(e.foodId);
    if (!f) continue;
    const k = e.grams / 100;
    t.kcal += f.kcal * k;
    t.proteinG += f.proteinG * k;
    t.carbsG += f.carbsG * k;
    t.fatG += f.fatG * k;
  }
  return t;
}

export async function foodDaySummaries(from: ISODate, to: ISODate): Promise<FoodDaySummary[]> {
  const entries = await db.foodEntries.where('date').between(from, to, true, true).toArray();
  const marks = new Map((await db.foodDays.where('date').between(from, to, true, true).toArray()).map((d) => [d.date, d.complete]));
  const out: FoodDaySummary[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = entries.filter((e) => e.date === d);
    const t = await totalsFor(day);
    const complete = marks.get(d) === true;
    // A day marked complete with no entries is a real "ate nothing" day.
    const status = complete ? 'complete' : day.length > 0 ? 'partial' : 'not-logged';
    out.push({ date: d, status, kcal: t.kcal, proteinG: t.proteinG });
  }
  return out;
}

// ---------- Weekly review ----------

export async function reviewFor(monday: ISODate) {
  const settings = await db.settings.get('me');
  const days = weekDates(monday);
  const end = days[6] < today() ? days[6] : today();
  const sessions = await db.sessions.where('date').between(days[0], days[6], true, true).filter((s) => s.finishedAt !== null).toArray();
  const ids = new Set(sessions.map((s) => s.id));
  const sets = (await db.sets.where('date').between(days[0], days[6], true, true).toArray()).filter((s) => ids.has(s.sessionId));
  const muscles = Object.fromEntries((await db.exercises.toArray()).map((e) => [e.id, { primary: e.primary, secondary: e.secondary }]));
  const targets = await targetsOn(end);
  const weighIns = (await db.weights.where('date').belowOrEqual(end).toArray()).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!settings || !targets) return null;
  return buildWeeklyReview({
    weekStart: monday,
    asOf: today(),
    plannedWeekdays: settings.trainingDays,
    completedSessionDates: [...new Set(sessions.map((s) => s.date))],
    setsByMuscle: setsByMuscle(sets.map((s) => s.exerciseId), muscles),
    foodDays: await foodDaySummaries(addDays(end, -13), end),
    weighIns,
    targets,
    gainRatePctPerWeek: settings.gainRatePctPerWeek,
  });
}

// ---------- Backup ----------

const TABLES = ['settings', 'programs', 'sessions', 'sets', 'weights', 'measurements', 'foods', 'foodEntries', 'savedMeals', 'foodDays', 'targets', 'decisions'] as const;

export async function exportAll(): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  return JSON.stringify({ app: 'rep-ledger', version: 1, exportedAt: nowISO(), data }, null, 2);
}

export async function importAll(json: string) {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'rep-ledger' || typeof parsed.data !== 'object') throw new Error('This is not a Rep Ledger backup file.');
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      if (Array.isArray(parsed.data[t])) await db.table(t).bulkAdd(parsed.data[t]);
    }
  });
  await syncBuiltIns();
}
