// Exercise substitutions and programme validation.

import type { EquipmentKind, Exercise, Program } from '../db';
import type { Setting } from './program';

const HOME_EQUIPMENT: EquipmentKind[] = ['dumbbell', 'bodyweight'];

export const usableAt = (ex: Pick<Exercise, 'equipment'>, setting: Setting) => setting === 'gym' || HOME_EQUIPMENT.includes(ex.equipment);

/**
 * Exercises that train the same main muscle with equipment you have.
 * Same equipment type first, so the swap feels closest.
 */
export function alternativesFor(exerciseId: string, library: Exercise[], setting: Setting, exclude: string[] = []): Exercise[] {
  const current = library.find((e) => e.id === exerciseId);
  if (!current) return [];
  return library
    .filter((e) => e.id !== exerciseId && !exclude.includes(e.id) && e.primary === current.primary && usableAt(e, setting))
    .sort((a, b) => Number(b.equipment === current.equipment) - Number(a.equipment === current.equipment) || a.name.localeCompare(b.name));
}

export const LIMITS = { days: [1, 7], sets: [1, 8], reps: [1, 50], rest: [30, 600], rir: [0, 4] } as const;

/** Problems that would stop a programme from being saved, as plain sentences. */
export function validateProgram(p: Pick<Program, 'days'>, library: Pick<Exercise, 'id'>[]): string[] {
  const errors: string[] = [];
  const known = new Set(library.map((e) => e.id));
  if (p.days.length < LIMITS.days[0] || p.days.length > LIMITS.days[1]) errors.push('A programme needs between 1 and 7 days.');
  p.days.forEach((d, di) => {
    const label = d.name.trim() || `Day ${di + 1}`;
    if (!d.name.trim()) errors.push(`Day ${di + 1} needs a name.`);
    if (d.slots.length === 0) errors.push(`${label} needs at least one exercise.`);
    const seen = new Set<string>();
    d.slots.forEach((s, si) => {
      const where = `${label}, exercise ${si + 1}`;
      if (!known.has(s.exerciseId)) errors.push(`${where}: unknown exercise.`);
      if (seen.has(s.exerciseId)) errors.push(`${where}: already in this day. Each exercise appears once per day so its history stays comparable.`);
      seen.add(s.exerciseId);
      if (!(Number.isInteger(s.sets) && s.sets >= LIMITS.sets[0] && s.sets <= LIMITS.sets[1])) errors.push(`${where}: sets must be 1–8.`);
      if (!(Number.isInteger(s.repMin) && Number.isInteger(s.repMax) && s.repMin >= LIMITS.reps[0] && s.repMax <= LIMITS.reps[1] && s.repMin <= s.repMax)) {
        errors.push(`${where}: rep range must be whole numbers from 1 to 50, low to high.`);
      }
      if (!(s.restSec >= LIMITS.rest[0] && s.restSec <= LIMITS.rest[1])) errors.push(`${where}: rest must be 30 s to 10 min.`);
      if (!(s.targetRir >= LIMITS.rir[0] && s.targetRir <= LIMITS.rir[1])) errors.push(`${where}: reps in reserve target must be 0–4.`);
    });
  });
  return errors;
}
