// Double progression: stay at a weight and add reps until every set reaches
// the top of the rep range, then add the smallest available weight jump.

import { daysBetween } from './dates';

export interface Prescription {
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  /** Smallest weight jump for this exercise in kg; 0 = bodyweight exercise. */
  increment: number;
}

export interface LoggedSet {
  weightKg: number | null;
  reps: number;
  rir: number | null;
}

/** One exercise's sets from one past session. */
export interface ExerciseSession {
  date: string;
  sets: LoggedSet[];
}

export type SuggestionKind = 'first-time' | 'increase' | 'reps-up' | 'hold' | 'reduce' | 'harder-variation';

export interface Suggestion {
  kind: SuggestionKind;
  weightKg: number | null;
  targetReps: number;
  reasons: string[];
}

export const REDUCE_FACTOR = 0.9;

export function roundDownTo(x: number, step: number): number {
  if (step <= 0) return x;
  // Small epsilon so 47.5 / 2.5 doesn't floor to 18.999…
  return Math.floor(x / step + 1e-9) * step;
}

const kg = (w: number | null) => (w === null ? 'bodyweight' : `${+w.toFixed(2)} kg`);

/** After this many days without the exercise, don't add weight yet. */
export const SHORT_BREAK_DAYS = 14;
/** After this many days, start about 10% lighter. */
export const LONG_BREAK_DAYS = 28;

/**
 * Next-session target for one exercise.
 * @param history this exercise's past finished sessions, most recent first.
 * @param asOf the date of the session being planned; enables the missed-session rules.
 */
export function suggestNext(p: Prescription, history: ExerciseSession[], asOf?: string): Suggestion {
  const last = history[0];
  if (!last || last.sets.length === 0) {
    return {
      kind: 'first-time',
      weightKg: null,
      targetReps: p.repMin,
      reasons: [
        `First time: pick a weight you can lift for ${p.repMin}–${p.repMax} reps with good form, stopping with about ${p.targetRir} reps left in reserve.`,
        'If unsure, start lighter. The next sessions adjust from what you log.',
      ],
    };
  }

  const weight = last.sets[0].weightKg;
  const bodyweight = p.increment === 0 || weight === null;
  const minReps = Math.min(...last.sets.map((s) => s.reps));
  const allTop = last.sets.length >= p.sets && last.sets.every((s) => s.reps >= p.repMax);
  const anyBelow = last.sets.some((s) => s.reps < p.repMin);
  const gap = asOf ? daysBetween(last.date, asOf) : 0;

  if (gap >= LONG_BREAK_DAYS) {
    if (bodyweight) {
      return {
        kind: 'hold', weightKg: weight, targetReps: p.repMin,
        reasons: [`Last done ${gap} days ago.`, `Ease back in at ${p.repMin} reps a set before pushing for more.`],
      };
    }
    const w = weight as number;
    const reduced = Math.max(0, Math.min(roundDownTo(w * REDUCE_FACTOR, p.increment), w - p.increment));
    return {
      kind: 'reduce', weightKg: reduced, targetReps: p.repMin,
      reasons: [
        `Last done ${gap} days ago, at ${kg(w)}.`,
        `Strength dips after a few weeks off, so start about 10% lighter at ${kg(reduced)} and build back up.`,
      ],
    };
  }

  if (last.sets.length < p.sets) {
    return {
      kind: 'hold',
      weightKg: weight,
      targetReps: Math.max(p.repMin, minReps),
      reasons: [`Last time you logged ${last.sets.length} of ${p.sets} sets, so repeat the same target and complete all sets.`],
    };
  }

  if (allTop) {
    if (bodyweight) {
      return {
        kind: 'harder-variation',
        weightKg: weight,
        targetReps: p.repMax,
        reasons: [
          `All ${p.sets} sets reached ${p.repMax} reps.`,
          'Make it harder: slow the lowering to 3 seconds, add a backpack with weight, or move to a harder variation.',
        ],
      };
    }
    if (gap >= SHORT_BREAK_DAYS) {
      return {
        kind: 'hold', weightKg: weight, targetReps: p.repMax,
        reasons: [
          `All sets reached ${p.repMax} reps last time, but that was ${gap} days ago.`,
          `Repeat ${kg(weight)} first; if it still feels solid, the weight goes up next session.`,
        ],
      };
    }
    const next = (weight as number) + p.increment;
    return {
      kind: 'increase',
      weightKg: next,
      targetReps: p.repMin,
      reasons: [
        `All ${p.sets} sets reached the top of the range (${p.repMax} reps) at ${kg(weight)}.`,
        `Add your smallest jump (+${p.increment} kg) and build back up from ${p.repMin} reps.`,
      ],
    };
  }

  if (anyBelow && !bodyweight) {
    const prev = history[1];
    const prevWeight = prev?.sets[0]?.weightKg ?? null;
    const prevAlsoBelow =
      prev !== undefined && prevWeight !== null && prevWeight >= (weight as number) && prev.sets.some((s) => s.reps < p.repMin);
    if (prevAlsoBelow) {
      const reduced = Math.min(roundDownTo((weight as number) * REDUCE_FACTOR, p.increment), (weight as number) - p.increment);
      return {
        kind: 'reduce',
        weightKg: Math.max(0, reduced),
        targetReps: p.repMin,
        reasons: [
          `Two sessions in a row with a set below ${p.repMin} reps at ${kg(weight)}.`,
          `Drop about 10% to ${kg(Math.max(0, reduced))} and work back up. This usually breaks a stall faster than grinding.`,
        ],
      };
    }
    return {
      kind: 'hold',
      weightKg: weight,
      targetReps: p.repMin,
      reasons: [
        `A set fell below ${p.repMin} reps at ${kg(weight)}. One tough day is normal.`,
        'Keep the weight and aim for the bottom of the range. If it happens again next time, the app will suggest a small reduction.',
      ],
    };
  }

  const target = Math.min(p.repMax, Math.max(p.repMin, minReps + 1));
  return {
    kind: 'reps-up',
    weightKg: weight,
    targetReps: target,
    reasons: [
      `Keep ${kg(weight)} and aim for ${target} reps on every set (your lowest set last time was ${minReps}).`,
      `When all sets reach ${p.repMax}, the weight goes up.`,
    ],
  };
}

/**
 * Estimated 1-rep max (Epley), counting reps in reserve as reps you could have done.
 * Null for bodyweight sets or when the estimate would be unreliable (> 15 reps).
 */
export function estimateOneRepMax(s: LoggedSet): number | null {
  if (s.weightKg === null || s.weightKg <= 0 || s.reps <= 0) return null;
  const effective = s.reps + (s.rir ?? 0);
  if (effective > 15) return null;
  return s.weightKg * (1 + effective / 30);
}

export function bestOneRepMax(sets: LoggedSet[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const e = estimateOneRepMax(s);
    if (e !== null && (best === null || e > best)) best = e;
  }
  return best;
}
