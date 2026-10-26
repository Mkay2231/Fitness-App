// Shared pieces for showing a session's plan: today's target beside last time.

import type { PlanRow } from './data';
import type { ExerciseSession, Suggestion } from './rules/progression';
import { fmt, fmtDate } from './ui';

export const kg = (w: number | null) => (w === null ? 'BW' : fmt(w, 2));

export function targetText(s: Suggestion): string {
  if (s.kind === 'first-time') return 'Find your weight';
  return `${s.weightKg !== null ? `${kg(s.weightKg)} kg` : 'Bodyweight'} × ${s.targetReps}`;
}

/** "40 × 12, 12, 11" when the weight is the same on every set. */
export function lastText(last?: ExerciseSession): string {
  if (!last || last.sets.length === 0) return 'No history yet';
  const weights = new Set(last.sets.map((s) => s.weightKg));
  if (weights.size === 1) {
    const w = last.sets[0].weightKg;
    return `${w === null ? 'BW' : `${kg(w)} kg`} × ${last.sets.map((s) => s.reps).join(', ')}`;
  }
  return last.sets.map((s) => `${kg(s.weightKg)}×${s.reps}`).join(', ');
}

export const lastDate = (last?: ExerciseSession) => (last ? fmtDate(last.date) : '');

export const restText = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function rxText(r: PlanRow['slot']) {
  return `${r.sets} sets · ${r.repMin}–${r.repMax} reps · rest ${restText(r.restSec)}`;
}

export function PlanList({ rows }: { rows: PlanRow[] }) {
  return (
    <ul className="plan">
      {rows.map(({ slot, ex, suggestion, last }) => (
        <li key={slot.exerciseId}>
          <span className="ex-name">{ex.name}</span>
          <span className="target">{suggestion.kind === 'first-time' ? <span className="tag">New</span> : targetText(suggestion)}</span>
          <span className="ex-rx">{slot.sets} × {slot.repMin}–{slot.repMax}</span>
          <span className="prev">{last ? `Last ${lastText(last)}` : ''}</span>
        </li>
      ))}
    </ul>
  );
}
