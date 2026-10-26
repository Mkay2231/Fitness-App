import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, type Exercise, type ProgramSlot, type SetLog } from '../db';
import { nowISO, suggestionFor } from '../data';
import type { ExerciseSession, Suggestion } from '../rules/progression';
import { Chips, Reasons, Stepper, fmt } from '../ui';

interface Draft { weightKg: number | null; reps: number | null; rir: number | null }

const RIR_OPTIONS = [
  { value: 0, label: '0' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4+' },
];

function useRestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => {
      tick((n) => n + 1);
      if (Date.now() >= endsAt) {
        navigator.vibrate?.([200, 100, 200]);
        setEndsAt(null);
      }
    }, 250);
    return () => clearInterval(t);
  }, [endsAt]);
  const left = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  return {
    left,
    running: endsAt !== null,
    start: (sec: number) => setEndsAt(Date.now() + sec * 1000),
    add: (sec: number) => setEndsAt((e) => (e === null ? null : e + sec * 1000)),
    stop: () => setEndsAt(null),
  };
}

export default function Workout() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const timer = useRestTimer();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id);
    if (!session) return { session: null };
    const settings = (await db.settings.get('me'))!;
    const program = await db.programs.get(session.programId);
    const day = program?.days.find((d) => d.id === session.dayId);
    const sets = await db.sets.where('sessionId').equals(id).sortBy('setIndex');
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const items = await Promise.all((day?.slots ?? []).map(async (slot) => {
      const ex = exercises.get(slot.exerciseId)!;
      const { suggestion, last } = await suggestionFor(slot, ex, settings, id);
      return { slot, ex, suggestion, last, logged: sets.filter((s) => s.exerciseId === ex.id), increment: ex.equipment === 'bodyweight' ? 0 : settings.increments[ex.equipment] };
    }));
    return { session, day, items, total: sets.length };
  }, [id]);

  if (!data) return null;
  if (!data.session) return <p>Workout not found.</p>;
  const { session, day, items, total } = data;
  const finished = session.finishedAt !== null;

  async function logSet(slot: ProgramSlot, ex: Exercise, logged: SetLog[], d: Draft) {
    if (d.reps === null || d.reps <= 0) return;
    await db.sets.add({
      sessionId: id, exerciseId: ex.id, date: session!.date, setIndex: logged.length,
      weightKg: ex.equipment === 'bodyweight' ? null : d.weightKg, reps: d.reps, rir: d.rir, loggedAt: nowISO(),
    });
    setDrafts(({ [ex.id]: _, ...rest }) => rest);
    timer.start(slot.restSec);
  }

  async function finish() {
    if (total === 0) {
      if (!confirm('No sets logged. Discard this workout?')) return;
      await db.sessions.delete(id);
      navigate('/');
      return;
    }
    const remaining = items.reduce((n, it) => n + Math.max(0, it.slot.sets - it.logged.length), 0);
    if (remaining > 0 && !confirm(`${remaining} planned set(s) not logged. Finish anyway?`)) return;
    await db.sessions.update(id, { finishedAt: nowISO() });
    timer.stop();
    navigate('/');
  }

  return (
    <>
      <div className="row between">
        <h1>{day?.name ?? 'Workout'}</h1>
        {finished && <span className="badge ok">Finished</span>}
      </div>
      <details className="card soft">
        <summary>How to rate effort (RIR)</summary>
        <p className="small">RIR = <strong>reps in reserve</strong>: after a set, how many more clean reps could you have done? 0 means you couldn't do another. Aim for about 2. It takes a few weeks to judge well, so guess honestly.</p>
      </details>

      {items.map(({ slot, ex, suggestion, last, logged, increment }) => (
        <ExerciseCard
          key={ex.id}
          slot={slot} ex={ex} suggestion={suggestion} last={last} logged={logged} increment={increment}
          draft={drafts[ex.id] ?? defaultDraft(slot, suggestion, logged)}
          setDraft={(d) => setDrafts((cur) => ({ ...cur, [ex.id]: d }))}
          onLog={(d) => logSet(slot, ex, logged, d)}
          disabled={finished}
        />
      ))}

      {!finished && <button className="primary block" onClick={finish}>Finish workout</button>}
      {/* Keeps the last button clear of the floating rest timer. */}
      <div style={{ height: 80 }} aria-hidden="true" />

      {timer.running && (
        <div className="timer" role="timer" aria-live="off">
          <span className="small">Rest</span>
          <span className="time">{Math.floor(timer.left / 60)}:{String(timer.left % 60).padStart(2, '0')}</span>
          <button onClick={() => timer.add(30)}>+30s</button>
          <button onClick={timer.stop}>Skip</button>
        </div>
      )}
    </>
  );
}

function defaultDraft(slot: ProgramSlot, s: Suggestion, logged: SetLog[]): Draft {
  const prev = logged.at(-1);
  if (prev) return { weightKg: prev.weightKg, reps: prev.reps, rir: prev.rir ?? slot.targetRir };
  return { weightKg: s.weightKg, reps: s.targetReps, rir: slot.targetRir };
}

function ExerciseCard({ slot, ex, suggestion, last, logged, increment, draft, setDraft, onLog, disabled }: {
  slot: ProgramSlot; ex: Exercise; suggestion: Suggestion; last?: ExerciseSession; logged: SetLog[]; increment: number;
  draft: Draft; setDraft: (d: Draft) => void; onLog: (d: Draft) => void; disabled: boolean;
}) {
  const bodyweight = ex.equipment === 'bodyweight';
  const lastWeight = last?.sets[0]?.weightKg ?? null;
  const done = logged.length >= slot.sets;
  const unit = ex.perHand ? 'kg per hand' : 'kg';

  return (
    <section className="card" aria-label={ex.name}>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{ex.name}</h2>
        <span className={`badge ${done ? 'ok' : ''}`}>{logged.length}/{slot.sets}</span>
      </div>
      <p className="muted small" style={{ marginTop: 2 }}>
        {slot.sets} sets × {slot.repMin}–{slot.repMax} reps · ~{slot.targetRir} RIR · rest {Math.round((slot.restSec / 60) * 2) / 2} min
      </p>

      <div className="card soft" style={{ padding: 12, marginTop: 8 }}>
        <div style={{ fontWeight: 600 }}>
          {suggestion.kind === 'first-time' ? 'First time: find your starting weight'
            : `Target: ${suggestion.weightKg !== null ? `${fmt(suggestion.weightKg, 2)} ${unit}` : 'bodyweight'} × ${suggestion.targetReps}`}
        </div>
        {last && <div className="muted small">Last time ({last.date}): {last.sets.map((s) => `${s.weightKg ?? 'BW'}×${s.reps}`).join(', ')}</div>}
        <details><summary className="small">Why</summary><Reasons items={suggestion.reasons} /></details>
        {(suggestion.kind === 'increase' || suggestion.kind === 'reduce') && lastWeight !== null && logged.length === 0 && draft.weightKg !== lastWeight && !disabled && (
          <button className="small" onClick={() => setDraft({ ...draft, weightKg: lastWeight })}>Keep last weight ({fmt(lastWeight, 2)} kg) instead</button>
        )}
      </div>

      <details>
        <summary className="small">Form cues</summary>
        <ul className="reasons">{ex.cues.map((c) => <li key={c}>{c}</li>)}</ul>
      </details>

      {logged.map((s, i) => (
        <div key={s.id} className="set-row done">
          <span className="set-idx">{i + 1}</span>
          <span className="num" style={{ alignSelf: 'center', fontWeight: 600 }}>
            {s.weightKg !== null ? `${fmt(s.weightKg, 2)} kg` : 'BW'} × {s.reps}
            <span className="muted small"> · RIR {s.rir === 4 ? '4+' : s.rir ?? '–'}</span>
          </span>
          {!disabled && <button className="ghost danger small" style={{ justifySelf: 'end' }} onClick={() => db.sets.delete(s.id!)} aria-label={`Delete set ${i + 1}`}>Delete</button>}
        </div>
      ))}

      {!disabled && (
        <div className="set-row">
          <span className="set-idx">{logged.length + 1}</span>
          {bodyweight ? <span className="muted small" style={{ alignSelf: 'center' }}>Bodyweight</span> : (
            <Stepper label="Weight" suffix={unit} value={draft.weightKg} step={increment || 1} onChange={(v) => setDraft({ ...draft, weightKg: v })} />
          )}
          <Stepper label="Reps" value={draft.reps} step={1} onChange={(v) => setDraft({ ...draft, reps: v === null ? null : Math.round(v) })} />
          <div className="rir">
            <div className="mini-label">Reps left in reserve</div>
            <Chips label="Reps in reserve" value={draft.rir} options={RIR_OPTIONS} onChange={(v) => setDraft({ ...draft, rir: v })} />
          </div>
          <button
            className={`${done ? '' : 'primary'} block`}
            style={{ gridColumn: '1 / 4' }}
            disabled={!draft.reps || (!bodyweight && draft.weightKg === null)}
            onClick={() => onLog(draft)}
          >
            {done ? `Log extra set ${logged.length + 1}` : `Log set ${logged.length + 1}`}
          </button>
        </div>
      )}
    </section>
  );
}
