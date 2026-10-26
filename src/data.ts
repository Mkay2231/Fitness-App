// Reads and writes that combine the database with the rules engine.

import { db, type Exercise, type FoodEntry, type Program, type ProgramDay, type ProgramSlot, type SetLog, type Settings, type TargetVersion } from './db';
import { addDays, parseISODate, toISODate, weekDates, type ISODate } from './rules/dates';
import { FAT_SHARE, MIN_FAT_G_PER_KG, roundTo } from './rules/nutrition';
import { suggestNext, type ExerciseSession, type Prescription, type Suggestion } from './rules/progression';
import { buildProgram, programChanges } from './rules/program';
import { buildWeeklyReview, type FoodDaySummary } from './rules/review';
import { setsByMuscle } from './rules/volume';
import { EXERCISES } from './seed/exercises';
import { FOODS } from './seed/foods';
import { PROGRAM_TEMPLATES } from './seed/programs';
import { makeUnits } from './units';

export const today = (): ISODate => toISODate(new Date());
export const nowISO = () => new Date().toISOString();

/** Adds/updates built-in exercises and foods. Never touches your own data. */
export async function syncBuiltIns() {
  await db.transaction('rw', db.exercises, db.foods, async () => {
    await db.exercises.bulkPut(EXERCISES);
    await db.foods.bulkPut(FOODS);
  });
}

export const EXERCISE_NAMES: Record<string, string> = Object.fromEntries(EXERCISES.map((e) => [e.id, e.name]));

type ProgramProfile = Pick<Settings, 'setting' | 'experience' | 'sessionMinutes' | 'limitations'>;

/** The program your profile produces (not saved). */
export function programForProfile(p: ProgramProfile) {
  const template = PROGRAM_TEMPLATES.find((t) => t.setting === p.setting)!;
  return buildProgram(template, { experience: p.experience, sessionMinutes: p.sessionMinutes, limitations: p.limitations }, EXERCISE_NAMES);
}

/** What would change in your program if this profile were applied. Empty when nothing changes. */
export async function previewProgramChange(p: ProgramProfile) {
  const next = programForProfile(p);
  const current = await getActiveProgram();
  const changes = programChanges(current, next, EXERCISE_NAMES);
  if (current?.customised && changes.length) changes.unshift('This replaces the edits you made to your programme.');
  return { next, changes };
}

/** Saves the profile's program as the active one. Logged sessions are untouched. */
export async function applyProgram(p: ProgramProfile) {
  const next = programForProfile(p);
  await db.transaction('rw', db.programs, async () => {
    const existing = await db.programs.toArray();
    await db.programs.bulkPut(existing.map((x) => ({ ...x, active: false })));
    const prev = existing.find((x) => x.id === next.id);
    await db.programs.put({ ...next, active: true, createdAt: prev?.createdAt ?? nowISO() });
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

export async function suggestionFor(slot: ProgramSlot, exercise: Exercise, settings: Settings, excludeSessionId?: number, asOf: ISODate = today()) {
  const history = await exerciseHistory(exercise.id, excludeSessionId);
  return { suggestion: suggestNext(prescriptionFor(slot, exercise, settings), history, asOf), last: history[0] };
}

export interface PlanRow {
  slot: ProgramSlot;
  ex: Exercise;
  /** Set when this session does a different exercise than planned. */
  swappedFrom?: Exercise;
  suggestion: Suggestion;
  last?: ExerciseSession;
}

/** Each exercise of a program day with today's target and last performance. */
/**
 * Each exercise of a program day with today's target and last performance.
 * `swaps` replaces planned exercises for one session; the replacement uses its own history.
 */
export async function planFor(day: ProgramDay, settings: Settings, excludeSessionId?: number, swaps: Record<string, string> = {}, asOf: ISODate = today()): Promise<PlanRow[]> {
  const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
  return Promise.all(day.slots.map(async (slot) => {
    const swappedTo = swaps[slot.exerciseId];
    const ex = exercises.get(swappedTo ?? slot.exerciseId) ?? exercises.get(slot.exerciseId)!;
    return { slot, ex, swappedFrom: swappedTo ? exercises.get(slot.exerciseId) : undefined, ...(await suggestionFor(slot, ex, settings, excludeSessionId, asOf)) };
  }));
}

/** Do a different exercise for this session only. Passing the planned id undoes the swap. */
export async function swapForSession(sessionId: number, plannedId: string, newId: string) {
  const s = await db.sessions.get(sessionId);
  if (!s) throw new Error('Workout not found.');
  const swaps = { ...(s.swaps ?? {}) };
  if (newId === plannedId) delete swaps[plannedId]; else swaps[plannedId] = newId;
  await db.sessions.update(sessionId, { swaps });
}

/** Make a swap permanent in the programme. Past history stays under the old exercise. */
export async function replaceInProgram(programId: string, dayId: string, plannedId: string, newId: string) {
  await db.transaction('rw', db.programs, async () => {
    const p = await db.programs.get(programId);
    if (!p) throw new Error('Programme not found.');
    const days = p.days.map((d) => (d.id !== dayId ? d : {
      ...d,
      slots: d.slots.map((s) => (s.exerciseId !== plannedId ? s : {
        ...s, exerciseId: newId, note: `Replaced ${EXERCISE_NAMES[plannedId] ?? plannedId} on ${today()}. History for each exercise is kept separately.`,
      })),
    }));
    await db.programs.put({ ...p, days, customised: true });
  });
}

export { estimateMinutes } from './rules/program';

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
  // Weeks before your first targets (e.g. restored records) are compared with your earliest targets.
  const targets = (await targetsOn(end)) ?? (await db.targets.orderBy('effectiveFrom').first());
  const weighIns = (await db.weights.where('date').belowOrEqual(end).toArray()).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!settings || !targets) return null;

  // Each exercise done this week: its latest finished session this week and the one before it.
  const exercises = [];
  for (const exerciseId of new Set(sets.map((s) => s.exerciseId))) {
    const history = await exerciseHistory(exerciseId);
    const idx = history.findIndex((h) => h.date >= monday && h.date <= end);
    if (idx === -1) continue;
    exercises.push({ exerciseId, name: EXERCISE_NAMES[exerciseId] ?? exerciseId, latest: history[idx], previous: history[idx + 1] });
  }

  const allMeasurements = (await db.measurements.where('date').belowOrEqual(end).toArray()).sort((a, b) => (a.date < b.date ? -1 : 1));
  const measurements = [...new Set(allMeasurements.map((m) => m.site))].map((site) => {
    const ms = allMeasurements.filter((m) => m.site === site);
    return { site, latest: ms.at(-1)!, previous: ms.at(-2) };
  });

  const u = makeUnits(settings.weightUnit, settings.lengthUnit);
  return buildWeeklyReview({
    weekStart: monday,
    asOf: today(),
    plannedWeekdays: settings.trainingDays,
    completedSessionDates: [...new Set(sessions.map((s) => s.date))],
    setsByMuscle: setsByMuscle(sets.map((s) => s.exerciseId), muscles),
    exercises,
    foodDays: await foodDaySummaries(addDays(end, -13), end),
    weighIns,
    measurements,
    checkIns: await db.checkins.where('date').between(days[0], days[6], true, true).toArray(),
    targets,
    gainRatePctPerWeek: settings.gainRatePctPerWeek,
    fmtWeight: (kg) => u.w(kg),
    fmtRate: u.rate,
    fmtLength: (cm) => u.l(cm),
    fmtDay: (iso) => parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
  });
}

// ---------- Backup ----------

const TABLES = ['settings', 'programs', 'sessions', 'sets', 'weights', 'measurements', 'foods', 'foodEntries', 'savedMeals', 'foodDays', 'targets', 'decisions', 'measures', 'checkins', 'planSwaps'] as const;

export async function exportAll(): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  return JSON.stringify({ app: 'rep-ledger', version: 1, exportedAt: nowISO(), data }, null, 2);
}

export interface Snapshot { app: 'rep-ledger'; version: 1; data: Record<string, unknown[]> }

/**
 * Everything your account keeps: the backup file's contents without built-in foods,
 * which every copy of the app already has (and which change between app versions).
 */
export async function snapshot(): Promise<Snapshot> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  data.foods = (data.foods as { builtIn?: boolean }[]).filter((f) => !f.builtIn);
  return { app: 'rep-ledger', version: 1, data };
}

/** Escapes one CSV cell (RFC 4180): quotes when needed, doubles inner quotes. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');

export type CsvKind = 'sets' | 'weights' | 'measurements' | 'food' | 'checkins';

/** Spreadsheet-friendly export of one kind of record, always in kg and cm. */
export async function exportCsv(kind: CsvKind): Promise<string> {
  if (kind === 'sets') {
    const sessions = new Map((await db.sessions.toArray()).map((s) => [s.id, s]));
    const sets = (await db.sets.toArray()).sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : 1));
    return toCsv(['date', 'session_finished', 'exercise', 'set', 'weight_kg', 'reps', 'reps_in_reserve'],
      sets.map((s) => [s.date, sessions.get(s.sessionId)?.finishedAt ? 'yes' : 'no', EXERCISE_NAMES[s.exerciseId] ?? s.exerciseId, s.setIndex + 1, s.weightKg, s.reps, s.rir]));
  }
  if (kind === 'weights') {
    return toCsv(['date', 'weight_kg'], (await db.weights.orderBy('date').toArray()).map((w) => [w.date, w.kg]));
  }
  if (kind === 'measurements') {
    return toCsv(['date', 'site', 'cm'], (await db.measurements.orderBy('date').toArray()).map((m) => [m.date, m.site, m.cm]));
  }
  if (kind === 'checkins') {
    return toCsv(['date', 'sleep_hours', 'energy_1_5', 'soreness_1_5'], (await db.checkins.orderBy('date').toArray()).map((c) => [c.date, c.sleepHours, c.energy, c.soreness]));
  }
  const foods = new Map((await db.foods.toArray()).map((f) => [f.id, f]));
  const marks = new Map((await db.foodDays.toArray()).map((d) => [d.date, d.complete]));
  const entries = (await db.foodEntries.toArray()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return toCsv(['date', 'day_marked_complete', 'meal', 'food', 'portion', 'grams', 'kcal_est', 'protein_g_est', 'carbs_g_est', 'fat_g_est', 'source'],
    entries.map((e) => {
      const f = foods.get(e.foodId);
      const k = e.grams / 100;
      return [e.date, marks.get(e.date) ? 'yes' : 'no', e.slot, f?.name ?? e.foodId, e.portionText, Math.round(e.grams),
        f ? Math.round(f.kcal * k) : '', f ? +(f.proteinG * k).toFixed(1) : '', f ? +(f.carbsG * k).toFixed(1) : '', f ? +(f.fatG * k).toFixed(1) : '', f?.source.citation ?? ''];
    }));
}

/** Deletes every record on this device, including unfinished-workout drafts kept outside the database. */
export async function deleteAllData() {
  await db.delete();
  try {
    // Collect first (the standard key()/length API), then remove, so indices don't shift mid-loop.
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => !!k?.startsWith('rl-'));
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable: nothing to clear */ }
}

/** Fills profile fields added after a backup was made, so older backups restore cleanly. */
export function withProfileDefaults(s: Partial<Settings>): Partial<Settings> {
  return {
    experience: 'new', setting: 'gym', sessionMinutes: 60, limitations: [], avoidFoods: [],
    weightUnit: 'kg', lengthUnit: 'cm', trainingDays: [1, 3, 5], ...s,
  };
}

/**
 * Replaces everything on this device with a backup. Runs in one transaction:
 * if anything fails, nothing changes.
 */
export async function importAll(json: string) {
  let parsed: { app?: string; version?: number; data?: Record<string, unknown[]> };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("This file isn't a readable backup (it isn't valid JSON).");
  }
  if (parsed?.app !== 'rep-ledger' || typeof parsed.data !== 'object' || parsed.data === null) throw new Error('This is not a Rep Ledger backup file.');
  if ((parsed.version ?? 1) > 1) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  const data = parsed.data;
  if (!Array.isArray(data.settings) || data.settings.length === 0) throw new Error('This backup has no profile in it, so it was not restored.');
  data.settings = data.settings.map((s) => withProfileDefaults(s as Partial<Settings>));
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      if (Array.isArray(data[t])) await db.table(t).bulkAdd(data[t]);
    }
  });
  await syncBuiltIns();
}
