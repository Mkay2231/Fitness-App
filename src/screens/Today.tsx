import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db';
import { foodDaySummaries, getActiveProgram, nextProgramDay, openSession, startSession, suggestionFor, targetsOn, today } from '../data';
import { addDays, isoWeekday } from '../rules/dates';
import { fmt, fmtDate } from '../ui';

export default function Today() {
  const date = today();
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const settings = (await db.settings.get('me'))!;
    const program = await getActiveProgram();
    const open = await openSession();
    const doneToday = await db.sessions.where('date').equals(date).filter((s) => s.finishedAt !== null).count();
    const day = program ? await nextProgramDay(program) : undefined;
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const plan = day
      ? await Promise.all(day.slots.map(async (slot) => {
          const ex = exercises.get(slot.exerciseId)!;
          return { slot, ex, ...(await suggestionFor(slot, ex, settings)) };
        }))
      : [];
    const [food] = await foodDaySummaries(date, date);
    const targets = await targetsOn(date);
    const weight = await db.weights.get(date);
    let nextTraining = addDays(date, 1);
    for (let i = 2; i <= 7 && !settings.trainingDays.includes(isoWeekday(nextTraining)); i++) nextTraining = addDays(date, i);
    return { settings, program, open, doneToday, day, plan, food, targets, weight, nextTraining };
  }, [date]);
  const [weightInput, setWeightInput] = useState('');

  if (!data) return null;
  const { settings, program, open, doneToday, day, plan, food, targets, weight, nextTraining } = data;
  const isTrainingDay = settings.trainingDays.includes(isoWeekday(date));

  async function start() {
    if (!program || !day) return;
    navigate(`/workout/${await startSession(program, day.id)}`);
  }

  async function saveWeight() {
    const kg = +weightInput.replace(',', '.');
    if (!(kg >= 30 && kg <= 250)) return;
    await db.weights.put({ date, kg });
    setWeightInput('');
  }

  return (
    <>
      <h1>{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>

      {open ? (
        <div className="card">
          <span className="badge warn">In progress</span>
          <h2 style={{ marginTop: 8 }}>Workout started {fmtDate(open.date)}</h2>
          <Link className="btn primary" to={`/workout/${open.id}`} style={{ width: '100%' }}>Resume workout</Link>
        </div>
      ) : doneToday > 0 ? (
        <div className="card">
          <span className="badge ok">Done</span>
          <h2 style={{ marginTop: 8 }}>Workout logged today</h2>
          <p className="muted">Next planned session: {fmtDate(nextTraining)}. Eat well and sleep 7–9 hours; that's when muscle is built.</p>
        </div>
      ) : day ? (
        <div className="card">
          <div className="row between">
            <span className={`badge ${isTrainingDay ? 'ok' : ''}`}>{isTrainingDay ? 'Training day' : 'Rest day (planned)'}</span>
            <span className="muted small">{program?.name}</span>
          </div>
          <h2 style={{ marginTop: 8 }}>{day.name}</h2>
          {!isTrainingDay && <p className="muted small">Next planned session: {fmtDate(nextTraining)}. Rest days are part of the plan. You can still train today if your schedule changed.</p>}
          <ul className="list">
            {plan.map(({ slot, ex, suggestion }) => (
              <li key={slot.exerciseId} className="row between">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{ex.name}</div>
                  <div className="muted small">{slot.sets} × {slot.repMin}–{slot.repMax} reps · rest {Math.round(slot.restSec / 60 * 2) / 2} min</div>
                </div>
                <div className="num small" style={{ textAlign: 'right' }}>
                  {suggestion.kind === 'first-time' ? <span className="badge">New</span>
                    : <>{suggestion.weightKg !== null ? `${fmt(suggestion.weightKg, 1)} kg` : 'BW'} × {suggestion.targetReps}</>}
                </div>
              </li>
            ))}
          </ul>
          <button className={`${isTrainingDay ? 'primary' : ''} block`} style={{ marginTop: 8 }} onClick={start}>
            {isTrainingDay ? 'Start workout' : 'Train anyway'}
          </button>
        </div>
      ) : (
        <div className="card soft"><h3>No program selected</h3><Link to="/settings">Choose a program</Link></div>
      )}

      <div className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>Food today</h2><Link to="/food">Open</Link></div>
        {food.status === 'not-logged' ? (
          <p className="muted" style={{ marginTop: 8 }}>Not logged yet. Target {targets?.calories ?? '–'} kcal, {targets?.proteinG ?? '–'} g protein.</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            <div className="row between num"><span>{fmt(food.kcal)} / {targets?.calories} kcal</span><span>{fmt(food.proteinG)} / {targets?.proteinG} g protein</span></div>
            <div className="bar" style={{ marginTop: 6 }}><span style={{ width: `${Math.min(100, (food.kcal / (targets?.calories || 1)) * 100)}%` }} /></div>
            <p className="muted small" style={{ marginTop: 6 }}>{food.status === 'complete' ? 'Marked complete.' : 'In progress: not marked complete, so not counted in averages yet.'} Values are estimates.</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Body weight</h2>
        {weight ? (
          <p><strong className="num">{fmt(weight.kg, 1)} kg</strong> <span className="muted">logged today</span></p>
        ) : (
          <>
            <p className="muted small">Not logged today. Weigh in the morning after the toilet, before eating, for consistent numbers.</p>
            <div className="row">
              <input aria-label="Today's weight in kg" inputMode="decimal" placeholder="kg" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} />
              <button className="primary" onClick={saveWeight}>Save</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
