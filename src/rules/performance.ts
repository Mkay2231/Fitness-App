// Compares an exercise's latest session with its previous one. Only the same
// exercise is compared, so a swap never borrows another exercise's numbers.

import { bestOneRepMax, type ExerciseSession, type LoggedSet } from './progression';

export type PerformanceStatus = 'up' | 'flat' | 'down' | 'new' | 'not-comparable';

export interface PerformanceChange {
  exerciseId: string;
  name: string;
  status: PerformanceStatus;
  /** Signed change in % of the previous value, when comparable. */
  changePct: number | null;
  evidence: string;
}

/** A change smaller than this is treated as normal day-to-day variation. */
export const PERFORMANCE_THRESHOLD_PCT = 2;

const bestReps = (sets: LoggedSet[]) => Math.max(...sets.map((s) => s.reps));

function bestSet(sets: LoggedSet[]): LoggedSet {
  return [...sets].sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0) || b.reps - a.reps)[0];
}

export function comparePerformance(
  exerciseId: string,
  name: string,
  latest: ExerciseSession,
  previous: ExerciseSession | undefined,
  fmtWeight: (kg: number) => string,
  fmtDay: (iso: string) => string,
): PerformanceChange {
  const describe = (s: ExerciseSession) => {
    const b = bestSet(s.sets);
    const e1 = bestOneRepMax(s.sets);
    return `${b.weightKg === null ? 'bodyweight' : fmtWeight(b.weightKg)} × ${b.reps}${e1 !== null ? ` (est. 1RM ${fmtWeight(e1)})` : ''} on ${fmtDay(s.date)}`;
  };
  if (!previous) {
    return { exerciseId, name, status: 'new', changePct: null, evidence: `First record: ${describe(latest)}. Nothing earlier to compare with.` };
  }
  const bodyweight = latest.sets.every((s) => s.weightKg === null) && previous.sets.every((s) => s.weightKg === null);
  let now: number | null;
  let before: number | null;
  let measure: string;
  if (bodyweight) {
    now = bestReps(latest.sets);
    before = bestReps(previous.sets);
    measure = 'best set reps';
  } else {
    now = bestOneRepMax(latest.sets);
    before = bestOneRepMax(previous.sets);
    measure = 'estimated 1-rep max';
  }
  if (now === null || before === null || before === 0) {
    return { exerciseId, name, status: 'not-comparable', changePct: null, evidence: `${describe(latest)} vs ${describe(previous)}. Sets above 15 reps (or mixed bodyweight and loaded sets) can't be compared reliably.` };
  }
  const pct = ((now - before) / before) * 100;
  const status: PerformanceStatus = pct >= PERFORMANCE_THRESHOLD_PCT ? 'up' : pct <= -PERFORMANCE_THRESHOLD_PCT ? 'down' : 'flat';
  return {
    exerciseId, name, status, changePct: pct,
    evidence: `${describe(latest)} vs ${describe(previous)}: ${measure} ${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%.`,
  };
}
