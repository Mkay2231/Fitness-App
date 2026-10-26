import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db';
import { estimateMinutes, getActiveProgram, nextProgramDay, openSession, planFor, startSession } from '../data';
import { Icon } from '../icons';
import { PlanList, rxText } from '../plan';
import { fmtDate } from '../ui';
import { WEEKDAYS } from './Onboarding';

export default function Train() {
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const settings = (await db.settings.get('me'))!;
    const program = await getActiveProgram();
    if (!program) return { settings, program: undefined };
    const open = await openSession();
    const next = open ? program.days.find((d) => d.id === open.dayId)! : await nextProgramDay(program);
    const plan = await planFor(next, settings, open?.id);
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const sessions = (await db.sessions.filter((s) => s.finishedAt !== null).toArray()).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 12);
    const counts = await Promise.all(sessions.map((s) => db.sets.where('sessionId').equals(s.id!).count()));
    const programs = new Map((await db.programs.toArray()).map((p) => [p.id, p]));
    return { settings, program, open, next, plan, exercises, recent: sessions.map((s, i) => ({ s, sets: counts[i], name: programs.get(s.programId)?.days.find((d) => d.id === s.dayId)?.name ?? 'Workout' })) };
  });
  if (!data) return null;
  const { settings, program } = data;
  if (!program) {
    return (
      <div className="page">
        <header className="page-head"><h1>Train</h1></header>
        <section className="panel soft"><h2>No program yet</h2><p className="muted">Pick a gym or home program in Settings.</p><Link className="btn primary" to="/settings">Choose a program</Link></section>
      </div>
    );
  }
  const { open, next, plan, exercises, recent } = data;
  const days = settings.trainingDays.map((d) => WEEKDAYS.find((w) => w.value === d)?.label).join(', ');

  return (
    <div className="page">
      <header className="page-head">
        <h1>Train</h1>
        <p className="meta">{program.name} · {days}</p>
      </header>

      <section className="panel session-panel" aria-labelledby="next-h">
        <div className="head">
          <h2 id="next-h">{open ? `${next!.name} in progress` : `Next: ${next!.name}`}</h2>
          <p className="meta">{next!.slots.length} exercises · about {estimateMinutes(next!)} min</p>
        </div>
        <PlanList rows={plan!} />
        <div className="actions">
          {open
            ? <Link className="btn primary lg block" to={`/workout/${open.id}`}>Resume workout</Link>
            : <button className="primary lg block" onClick={async () => navigate(`/workout/${await startSession(program, next!.id)}`)}><Icon name="play" size="sm" />Start {next!.name}</button>}
        </div>
      </section>

      <section className="section" aria-labelledby="recent-h">
        <h2 id="recent-h">Recent workouts</h2>
        {recent!.length === 0 ? (
          <div className="panel soft"><p className="muted" style={{ margin: 0 }}>No finished workouts yet. Each one appears here with every set you logged, and you can open it to correct a set.</p></div>
        ) : (
          <ul className="rows panel" style={{ padding: '0 16px' }}>
            {recent!.map(({ s, sets, name }) => (
              <li key={s.id}>
                <Link className="row-link" to={`/workout/${s.id}`}>
                  <span className="grow"><span className="row-title">{name}</span><span className="row-sub" style={{ display: 'block' }}>{fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'short' })}</span></span>
                  <span className="row-end muted">{sets} sets</span>
                  <Icon name="next" size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="program-h">
        <div className="panel-head"><h2 id="program-h">The program</h2><Link to="/settings" className="small">Change</Link></div>
        <p className="muted small">Alternate the sessions on your training days. Weights go up when every set reaches the top of its rep range.</p>
        {program.days.map((d) => (
          <div key={d.id} className="panel" style={{ padding: '16px 16px 4px' }}>
            <h3>{d.name}</h3>
            <ul className="rows">
              {d.slots.map((sl) => (
                <li key={sl.exerciseId} className="row between">
                  <span>{exercises!.get(sl.exerciseId)?.name}</span>
                  <span className="muted small num">{rxText(sl)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
