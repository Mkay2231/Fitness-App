// Shared pieces for showing a session's plan: today's target beside last time.

import type { PlanRow } from './data';
import type { ExerciseSession, Suggestion } from './rules/progression';
import { fmtDate } from './ui';
import { useUnits, type Units } from './units';

/** Weight number in the user's unit, or BW for bodyweight sets. */
export const wt = (u: Units, kg: number | null) => (kg === null ? 'BW' : u.wNum(kg).toLocaleString('en-NG', { maximumFractionDigits: 2 }));

export function targetText(u: Units, s: Suggestion): string {
  if (s.kind === 'first-time') return 'Find your weight';
  return `${s.weightKg !== null ? `${wt(u, s.weightKg)} ${u.wu}` : 'Bodyweight'} × ${s.targetReps}`;
}

/** "40 kg × 12, 12, 11" when the weight is the same on every set. */
export function lastText(u: Units, last?: ExerciseSession): string {
  if (!last || last.sets.length === 0) return 'No history yet';
  const weights = new Set(last.sets.map((s) => s.weightKg));
  if (weights.size === 1) {
    const w = last.sets[0].weightKg;
    return `${w === null ? 'BW' : `${wt(u, w)} ${u.wu}`} × ${last.sets.map((s) => s.reps).join(', ')}`;
  }
  return last.sets.map((s) => `${wt(u, s.weightKg)}×${s.reps}`).join(', ');
}

export const lastDate = (last?: ExerciseSession) => (last ? fmtDate(last.date) : '');

export const restText = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function rxText(r: PlanRow['slot']) {
  return `${r.sets} sets · ${r.repMin}–${r.repMax} reps · rest ${restText(r.restSec)}`;
}

export function PlanList({ rows }: { rows: PlanRow[] }) {
  const u = useUnits();
  return (
    <ul className="plan">
      {rows.map(({ slot, ex, suggestion, last }) => (
        <li key={slot.exerciseId}>
          <span className="ex-name">{ex.name}</span>
          <span className="target">{suggestion.kind === 'first-time' ? <span className="tag">New</span> : targetText(u, suggestion)}</span>
          <span className="ex-rx">{slot.sets} × {slot.repMin}–{slot.repMax}</span>
          <span className="prev">{last ? `Last ${lastText(u, last)}` : ''}</span>
        </li>
      ))}
    </ul>
  );
}
