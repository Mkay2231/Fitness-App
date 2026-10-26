import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db';
import { estimateMinutes, foodDaySummaries, getActiveProgram, nextProgramDay, openSession, planFor, startSession, targetsOn, today } from '../data';
import { Icon } from '../icons';
import { PlanList } from '../plan';
import { addDays, isoWeekday, weekDates, weekStart } from '../rules/dates';
import { Loading, fmt, fmtDate } from '../ui';
import { useUnits } from '../units';

export default function Today() {
  const date = today();
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const settings = (await db.settings.get('me'))!;
    const program = await getActiveProgram();
    const open = await openSession();
    const doneToday = await db.sessions.where('date').equals(date).filter((s) => s.finishedAt !== null).first();
    const day = program ? (open ? program.days.find((d) => d.id === open.dayId) : await nextProgramDay(program)) : undefined;
    const plan = day ? await planFor(day, settings, open?.id) : [];
    const openSets = open ? await db.sets.where('sessionId').equals(open.id!).count() : 0;
    const doneSets = doneToday ? await db.sets.where('sessionId').equals(doneToday.id!).count() : 0;
    const doneDay = doneToday ? program?.days.find((d) => d.id === doneToday.dayId) : undefined;
    const [food] = await foodDaySummaries(date, date);
    const targets = await targetsOn(date);
    const weight = await db.weights.get(date);
    const week = weekDates(weekStart(date));
    const weekDone = new Set((await db.sessions.where('date').between(week[0], week[6], true, true).filter((s) => s.finishedAt !== null).toArray()).map((s) => s.date));
    let nextTraining = addDays(date, 1);
    for (let i = 2; i <= 7 && !settings.trainingDays.includes(isoWeekday(nextTraining)); i++) nextTraining = addDays(date, i);
    return { settings, program, open, openSets, doneToday, doneSets, doneDay, day, plan, food, targets, weight, week, weekDone, nextTraining };
  }, [date]);
  const u = useUnits();
  const [weightInput, setWeightInput] = useState('');
  const [weightError, setWeightError] = useState('');

  if (!data) return <Loading label="Loading today" />;
  const { settings, program, open, openSets, doneToday, doneSets, doneDay, day, plan, food, targets, weight, week, weekDone, nextTraining } = data;
  const isTrainingDay = settings.trainingDays.includes(isoWeekday(date));
  const totalSets = day?.slots.reduce((n, s) => n + s.sets, 0) ?? 0;
  const planned = week.filter((d) => settings.trainingDays.includes(isoWeekday(d)));

  async function start() {
    if (!program || !day) return;
    navigate(`/workout/${await startSession(program, day.id)}`);
  }

  async function saveWeight(e: React.FormEvent) {
    e.preventDefault();
    const kg = u.wIn(+weightInput.replace(',', '.'));
    if (!(kg >= 30 && kg <= 250)) { setWeightError(`Enter your weight in ${u.wu} (${u.wu === 'kg' ? '30–250' : '66–550'}).`); return; }
    await db.weights.put({ date, kg });
    setWeightInput('');
    setWeightError('');
  }

  let session: React.ReactNode;
  if (open && day) {
    session = (
      <section className="panel session-panel" aria-labelledby="session-h">
        <div className="head">
          <div className="state-line"><span className="tag warn">In progress</span>{fmtDate(open.date)}</div>
          <h2 id="session-h" style={{ marginTop: 10 }}>{day.name}</h2>
          <p className="meta">{openSets} of {totalSets} sets logged. Your sets are saved, so pick up where you stopped.</p>
        </div>
        <PlanList rows={plan} />
        <div className="actions"><Link className="btn primary lg block" to={`/workout/${open.id}`}>Resume workout</Link></div>
      </section>
    );
  } else if (doneToday) {
    session = (
      <section className="panel session-panel" aria-labelledby="session-h">
        <div className="head" style={{ paddingBottom: 20 }}>
          <div className="state-line"><span className="tag ok"><Icon name="check" size="sm" />Logged</span></div>
          <h2 id="session-h" style={{ marginTop: 10 }}>{doneDay?.name ?? 'Workout'} done</h2>
          <p className="meta">{doneSets} sets recorded. Next session {fmtDate(nextTraining, { weekday: 'long' })}. Eat well and sleep 7–9 hours tonight; that's when the muscle is built.</p>
          <Link className="btn" to={`/workout/${doneToday.id}`} style={{ marginTop: 8 }}>View sets</Link>
        </div>
      </section>
    );
  } else if (day && isTrainingDay) {
    session = (
      <section className="panel session-panel" aria-labelledby="session-h">
        <div className="head">
          <h2 id="session-h">{day.name}</h2>
          <p className="meta">{day.slots.length} exercises · about {estimateMinutes(day)} min · {program?.setting === 'home' ? 'home' : 'gym'}</p>
        </div>
        <PlanList rows={plan} />
        <div className="actions"><button className="primary lg block" onClick={start}><Icon name="play" size="sm" />Start workout</button></div>
      </section>
    );
  } else if (day) {
    session = (
      <section className="panel session-panel" aria-labelledby="session-h">
        <div className="head" style={{ paddingBottom: 16 }}>
          <h2 id="session-h">Rest day</h2>
          <p className="meta">Next up: {day.name} on {fmtDate(nextTraining, { weekday: 'long' })}. Rest days are part of the plan; muscles grow while you recover.</p>
          <details>
            <summary>Preview {day.name}</summary>
            <div style={{ margin: '0 -20px' }}><PlanList rows={plan} /></div>
          </details>
          <button className="ghost" onClick={start} style={{ marginLeft: -12 }}>Train today instead</button>
        </div>
      </section>
    );
  } else {
    session = (
      <section className="panel soft">
        <h2>No program yet</h2>
        <p className="muted">Pick a gym or home program to get today's workout.</p>
        <Link className="btn primary" to="/settings">Choose a program</Link>
      </section>
    );
  }

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Today</h1>
          <p className="meta">{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })} · {isTrainingDay ? 'training day' : 'rest day'}</p>
        </div>
        <Link to="/settings" className="btn ghost icon-btn mobile-only" aria-label="Settings"><Icon name="settings" /></Link>
      </header>

      {session}

      <section className="section" aria-labelledby="day-h">
        <h2 id="day-h">Your day</h2>
        <ul className="rows panel" style={{ padding: '0 16px' }}>
          <li>
            <Link className="row-link" to="/food">
              <Icon name="food" />
              <span className="grow">
                <span className="row-title">Food</span>
                <span className="row-sub" style={{ display: 'block' }}>
                  {food.status === 'not-logged'
                    ? `Not logged yet. Target ${fmt(targets?.calories ?? 0)} kcal, ${targets?.proteinG ?? '–'} g protein`
                    : `${fmt(food.kcal)} of ${fmt(targets?.calories ?? 0)} kcal · ${fmt(food.proteinG)} of ${targets?.proteinG} g protein${food.status === 'complete' ? ' · complete' : ''}`}
                </span>
              </span>
              <Icon name="next" size="sm" />
            </Link>
          </li>
          <li>
            {weight ? (
              <Link className="row-link" to="/progress">
                <Icon name="scale" />
                <span className="grow">
                  <span className="row-title">Body weight</span>
                  <span className="row-sub" style={{ display: 'block' }}><span className="num">{u.w(weight.kg)}</span> logged today</span>
                </span>
                <Icon name="next" size="sm" />
              </Link>
            ) : (
              <form onSubmit={saveWeight} style={{ padding: '4px 0' }}>
                <label htmlFor="today-weight" className="row" style={{ gap: 12, fontWeight: 600 }}><Icon name="scale" />Body weight</label>
                <div className="row">
                  <input id="today-weight" inputMode="decimal" placeholder={u.wu} value={weightInput} aria-invalid={!!weightError} aria-describedby="weight-help" onChange={(e) => setWeightInput(e.target.value)} />
                  <button type="submit">Save</button>
                </div>
                <p id="weight-help" className={weightError ? 'hint error-text' : 'hint'}>{weightError || 'Not logged today. Weigh in the morning, after the toilet and before eating.'}</p>
              </form>
            )}
          </li>
          <li>
            <Link className="row-link" to="/review">
              <Icon name="review" />
              <span className="grow">
                <span className="row-title">This week</span>
                <span className="row-sub" style={{ display: 'block' }}>
                  {planned.filter((d) => weekDone.has(d)).length} of {planned.length} planned sessions ·{' '}
                  {planned.map((d) => `${fmtDate(d, { weekday: 'short' })}${weekDone.has(d) ? ' done' : ''}`).join(', ')}
                </span>
              </span>
              <Icon name="next" size="sm" />
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
