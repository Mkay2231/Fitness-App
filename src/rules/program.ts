// Turns a program template into your program, using only profile answers that
// change what you do: experience, session length and physical limitations.
// Every change is recorded on the slot as a note so the app can explain it.

import type { Program, ProgramDay, ProgramSlot } from '../db';

export type Experience = 'new' | 'some' | 'experienced';
export type Limitation = 'knees' | 'lowerBack' | 'shoulders' | 'wrists';
export type Setting = 'gym' | 'home';

export interface ProgramOptions {
  experience: Experience;
  sessionMinutes: number;
  limitations: Limitation[];
}

export const LIMITATION_LABELS: Record<Limitation, string> = {
  knees: 'Knees',
  lowerBack: 'Lower back',
  shoulders: 'Shoulders',
  wrists: 'Wrists',
};

/** Exercise swaps per limitation. A setting-specific swap wins over the shared one. */
const SWAPS: Record<Limitation, Record<string, string | { gym: string; home: string }>> = {
  knees: { 'split-squat': 'box-squat', 'goblet-squat': 'box-squat' },
  lowerBack: { 'db-rdl': { gym: 'leg-curl', home: 'glute-bridge' }, 'db-bent-row': 'one-arm-row' },
  shoulders: { 'db-shoulder-press': 'db-lateral-raise' },
  wrists: { 'push-up': 'db-floor-press' },
};

/** Slots in the first three positions of each day are the main compound lifts. */
const COMPOUND_SLOTS = 3;
const MIN_SLOTS = 4;

/** Session length estimate: ~40 s per set of work, plus rest, plus 5 min warm-up. */
export function estimateMinutes(day: Pick<ProgramDay, 'slots'>): number {
  const sec = day.slots.reduce((s, sl) => s + sl.sets * (40 + sl.restSec), 0) + 300;
  return Math.round(sec / 60 / 5) * 5;
}

function applyExperience(slots: ProgramSlot[], experience: Experience): ProgramSlot[] {
  return slots.map((s, i) => {
    if (experience === 'new') {
      return { ...s, targetRir: 3, note: addNote(s.note, 'Stopping 3 reps short while you learn the movement.') };
    }
    if (experience === 'experienced' && i < COMPOUND_SLOTS) {
      return { ...s, sets: s.sets + 1, note: addNote(s.note, 'One extra set because you have trained consistently before.') };
    }
    return s;
  });
}

function applyLimitations(slots: ProgramSlot[], limitations: Limitation[], setting: Setting, names: Record<string, string>): ProgramSlot[] {
  let out = slots;
  for (const lim of limitations) {
    const next: ProgramSlot[] = [];
    for (const s of out) {
      const swap = SWAPS[lim][s.exerciseId];
      const to = typeof swap === 'string' ? swap : swap?.[setting];
      if (!to) { next.push(s); continue; }
      // Never put the same exercise in a day twice: drop the slot instead.
      if (out.some((o) => o.exerciseId === to) || next.some((o) => o.exerciseId === to)) continue;
      next.push({
        ...s,
        exerciseId: to,
        note: addNote(s.note, `Swapped from ${names[s.exerciseId] ?? s.exerciseId} because of your ${LIMITATION_LABELS[lim].toLowerCase()}.`),
      });
    }
    out = next;
  }
  return out;
}

/** Drops trailing accessory work, then compound sets, until the day fits. */
function fitToDuration(slots: ProgramSlot[], minutes: number): ProgramSlot[] {
  let out = [...slots];
  while (estimateMinutes({ slots: out }) > minutes && out.length > MIN_SLOTS) out = out.slice(0, -1);
  for (let i = 0; estimateMinutes({ slots: out }) > minutes && i < 12; i++) {
    // Take a set from whichever exercise has the most (the later one on a tie), never below 2.
    const most = Math.max(...out.map((s) => s.sets));
    if (most <= 2) break;
    const idx = out.map((s) => s.sets).lastIndexOf(most);
    out = out.map((s, j) => (j === idx ? { ...s, sets: s.sets - 1, note: addNote(s.note, `${s.sets - 1} sets to fit your ${minutes}-minute sessions.`) } : s));
  }
  return out;
}

const addNote = (prev: string | undefined, note: string) => (prev ? `${prev} ${note}` : note);

export function buildProgram(
  template: Omit<Program, 'active' | 'createdAt'>,
  opts: ProgramOptions,
  exerciseNames: Record<string, string> = {},
): Omit<Program, 'active' | 'createdAt'> {
  const days = template.days.map((d) => {
    let slots = applyLimitations(d.slots, opts.limitations, template.setting, exerciseNames);
    slots = applyExperience(slots, opts.experience);
    slots = fitToDuration(slots, opts.sessionMinutes);
    return { ...d, slots };
  });
  return { ...template, days };
}

/** Human-readable differences between two versions of a program, for review before applying. */
export function programChanges(
  before: Pick<Program, 'days' | 'name'> | undefined,
  after: Pick<Program, 'days' | 'name'>,
  names: Record<string, string>,
): string[] {
  if (!before) return [`Start ${after.name}.`];
  const out: string[] = [];
  if (before.name !== after.name) out.push(`Switch to ${after.name}.`);
  for (const d of after.days) {
    const old = before.days.find((x) => x.id === d.id);
    const oldSlots = new Map((old?.slots ?? []).map((s) => [s.exerciseId, s]));
    const newIds = new Set(d.slots.map((s) => s.exerciseId));
    for (const s of d.slots) {
      const o = oldSlots.get(s.exerciseId);
      if (!o) out.push(`${d.name}: add ${names[s.exerciseId] ?? s.exerciseId} (${s.sets} sets).`);
      else if (o.sets !== s.sets || o.targetRir !== s.targetRir) {
        out.push(`${d.name}: ${names[s.exerciseId] ?? s.exerciseId} ${o.sets}→${s.sets} sets${o.targetRir !== s.targetRir ? `, stop ${s.targetRir} reps short` : ''}.`);
      }
    }
    for (const [id] of oldSlots) if (!newIds.has(id)) out.push(`${d.name}: remove ${names[id] ?? id}.`);
  }
  return out;
}
