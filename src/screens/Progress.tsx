import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type WeightLog } from '../db';
import { exerciseHistory, today } from '../data';
import { Icon } from '../icons';
import { wt } from '../plan';
import { addDays, daysBetween, isoWeekday, weekDates, weekStart } from '../rules/dates';
import { bestOneRepMax } from '../rules/progression';
import { sevenDayAverage, weeklyRate } from '../rules/trend';
import { Empty, Loading, fmt, fmtDate } from '../ui';
import { useUnits, type Units } from '../units';

const SITES = ['Waist (at navel)', 'Chest', 'Upper arm (flexed)', 'Thigh', 'Hips'];

export default function Progress() {
  const u = useUnits();
  const data = useLiveQuery(async () => {
    const weights = await db.weights.orderBy('date').toArray();
    const measurements = await db.measurements.orderBy('date').toArray();
    const sets = await db.sets.toArray();
    const ids = [...new Set(sets.map((s) => s.exerciseId))];
    const names = new Map((await db.exercises.toArray()).map((e) => [e.id, e.name]));
    const lifts = (await Promise.all(ids.map(async (id) => ({ id, name: names.get(id) ?? id, history: await exerciseHistory(id) })))).filter((l) => l.history.length > 0);
    // Workout completion for the last 4 weeks: planned days so far vs days with a finished workout.
    const settings = (await db.settings.get('me'))!;
    const done = new Set((await db.sessions.filter((s) => s.finishedAt !== null).toArray()).map((s) => s.date));
    const thisMonday = weekStart(today());
    const weeks = [0, 1, 2, 3].map((n) => {
      const monday = addDays(thisMonday, -7 * n);
      const days = weekDates(monday).filter((d) => d <= today());
      const planned = days.filter((d) => settings.trainingDays.includes(isoWeekday(d)));
      return { monday, planned: planned.length, done: days.filter((d) => done.has(d)).length, missed: planned.filter((d) => !done.has(d) && d < today()).length };
    });
    return { weights, measurements, lifts, weeks };
  });

  const [wDate, setWDate] = useState(today());
  const [wVal, setWVal] = useState('');
  const [wError, setWError] = useState('');
  const [site, setSite] = useState(SITES[0]);
  const [mVal, setMVal] = useState('');
  const [mError, setMError] = useState('');

  if (!data) return <Loading label="Loading progress" />;
  const { weights, measurements, lifts, weeks } = data;
  const d = today();
  const avg = sevenDayAverage(weights, d);
  const rate = weeklyRate(weights, d);

  async function saveWeight(e: React.FormEvent) {
    e.preventDefault();
    const kg = u.wIn(+wVal.replace(',', '.'));
    if (!(kg >= 30 && kg <= 250)) { setWError(`Enter a weight in ${u.wu} (${u.wu === 'kg' ? '30–250' : '66–550'}).`); return; }
    if (!wDate || wDate > d) { setWError('Choose a date that isn\'t in the future.'); return; }
    await db.weights.put({ date: wDate, kg });
    setWVal('');
    setWError('');
  }

  async function saveMeasurement(e: React.FormEvent) {
    e.preventDefault();
    const cm = u.lIn(+mVal.replace(',', '.'));
    if (!(cm > 10 && cm < 300)) { setMError(`Enter the size in ${u.lu}.`); return; }
    await db.measurements.add({ date: d, site, cm });
    setMVal('');
    setMError('');
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Progress</h1>
        <p className="meta">Body weight, measurements and lifts. Only what you have recorded.</p>
      </header>

      <section className="card" aria-labelledby="bw-h">
        <h2 id="bw-h">Body weight</h2>
        <form className="form-grid" onSubmit={saveWeight} noValidate>
          <div><label htmlFor="w-date">Date</label><input id="w-date" type="date" value={wDate} max={d} onChange={(e) => setWDate(e.target.value)} /></div>
          <div><label htmlFor="w-val">Weight ({u.wu})</label><input id="w-val" inputMode="decimal" placeholder={u.wu === 'kg' ? 'e.g. 62.4' : 'e.g. 137.5'} value={wVal} aria-invalid={!!wError} onChange={(e) => setWVal(e.target.value)} /></div>
          <button type="submit">Save</button>
        </form>
        {wError && <p className="hint error-text" role="alert">{wError}</p>}
        {weights.length === 0 ? (
          <p className="muted small" style={{ marginTop: 8 }}>No weigh-ins yet. Daily weight moves with water and food, so the 7-day average and trend appear after a few entries.</p>
        ) : (
          <>
            <div className="kpis" style={{ marginTop: 10 }}>
              <div className="kpi"><div className="v">{avg !== null ? u.w(avg) : '–'}</div><div className="l">7-day average{avg === null ? ' (none this week)' : ''}</div></div>
              <div className="kpi"><div className="v">{rate !== null ? u.rate(rate) : '–'}</div><div className="l">{rate !== null ? '14-day weight trend' : 'Trend needs 8 weigh-ins over 10+ days'}</div></div>
            </div>
            <p className="hint">This is scale weight: it includes water, food and fat as well as muscle, so it can't show muscle gain on its own. Read it alongside your lifts and measurements.</p>
            <WeightChart weights={weights} u={u} />
            <details><summary className="small">All weigh-ins ({weights.length})</summary>
              <ul className="list">{[...weights].reverse().map((w) => (
                <li key={w.date} className="row between"><span>{fmtDate(w.date)}</span><span className="num">{u.w(w.kg)}</span>
                  <button className="ghost danger icon-btn" onClick={() => db.weights.delete(w.date)} aria-label={`Delete weigh-in for ${fmtDate(w.date)}`}><Icon name="trash" size="sm" /></button></li>
              ))}</ul>
            </details>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="m-h">
        <h2 id="m-h">Measurements</h2>
        <p className="muted small">Every 2–4 weeks, same time of day, tape snug but not tight. Stored only on this device.</p>
        <form className="form-grid" onSubmit={saveMeasurement} noValidate>
          <div><label htmlFor="m-site">Where</label><select id="m-site" value={site} onChange={(e) => setSite(e.target.value)}>{SITES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label htmlFor="m-val">Size ({u.lu})</label><input id="m-val" inputMode="decimal" placeholder={u.lu === 'cm' ? 'e.g. 78.5' : 'e.g. 31'} value={mVal} aria-invalid={!!mError} onChange={(e) => setMVal(e.target.value)} /></div>
          <button type="submit">Add</button>
        </form>
        {mError && <p className="hint error-text" role="alert">{mError}</p>}
        {measurements.length === 0 ? <p className="muted small" style={{ marginTop: 8 }}>No measurements yet.</p> : (
          <ul className="list" style={{ marginTop: 8 }}>
            {SITES.filter((s) => measurements.some((m) => m.site === s)).map((s) => {
              const ms = measurements.filter((m) => m.site === s);
              const first = ms[0], last = ms[ms.length - 1];
              const diff = u.lNum(last.cm) - u.lNum(first.cm);
              return (
                <li key={s} className="row between">
                  <span>{s}</span>
                  <span className="num">{u.l(last.cm)} {ms.length > 1 && <span className="muted small">({diff >= 0 ? '+' : '−'}{fmt(Math.abs(diff), 1)} since {fmtDate(first.date)})</span>}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="wk-h">
        <h2 id="wk-h">Workouts</h2>
        <ul className="rows">
          {weeks.map((w) => (
            <li key={w.monday} className="row between">
              <span>{w.monday === weekStart(today()) ? 'This week' : `Week of ${fmtDate(w.monday, { day: 'numeric', month: 'short' })}`}</span>
              <span className="num small">{w.done} of {w.planned} planned{w.missed ? <span className="muted"> · {w.missed} not logged</span> : ''}</span>
            </li>
          ))}
        </ul>
        <p className="hint">Planned days so far each week. A day only counts once its workout is finished.</p>
      </section>

      <section aria-labelledby="lifts-h">
        <h2 id="lifts-h" style={{ marginBottom: 8 }}>Lifts</h2>
        {lifts.length === 0 ? (
          <Empty title="No finished workouts yet">Each exercise's best set and estimated 1-rep max appear here after you finish a workout.</Empty>
        ) : lifts.map((l) => {
          const latest = bestOneRepMax(l.history[0].sets);
          const first = bestOneRepMax(l.history[l.history.length - 1].sets);
          const change = latest !== null && first !== null && l.history.length > 1 ? u.wNum(latest) - u.wNum(first) : null;
          return (
            <details key={l.id} className="card">
              <summary className="row between" style={{ width: '100%' }}>
                <span>{l.name}</span>
                <span className="muted small num">{latest !== null ? `e1RM ${u.w(latest)}` : `${l.history.length} sessions`}{change !== null ? ` (${change >= 0 ? '+' : '−'}${fmt(Math.abs(change), 1)})` : ''}</span>
              </summary>
              <ul className="list">
                {l.history.map((h, i) => (
                  <li key={i} className="row between small">
                    <span>{fmtDate(h.date)}</span>
                    <span className="num">{h.sets.map((s) => `${wt(u, s.weightKg)}×${s.reps}`).join(', ')}</span>
                  </li>
                ))}
              </ul>
              <p className="hint">e1RM = estimated 1-rep max from your best set (Epley formula, counting reps in reserve). A rough strength trend, not a number to test.</p>
            </details>
          );
        })}
      </section>
    </div>
  );
}

function WeightChart({ weights, u }: { weights: WeightLog[]; u: Units }) {
  const end = today();
  const start = addDays(end, -55);
  const pts = weights.filter((w) => w.date >= start);
  if (pts.length < 2) return <p className="hint">The chart appears after two weigh-ins in the last 8 weeks.</p>;
  const vals = pts.map((p) => u.wNum(p.kg));
  const lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
  const W = 320, H = 140;
  const x = (date: string) => (daysBetween(start, date) / 55) * (W - 20) + 10;
  const y = (v: number) => H - 10 - ((v - lo) / (hi - lo)) * (H - 20);
  const avgLine = pts.map((p) => `${x(p.date)},${y(u.wNum(sevenDayAverage(weights, p.date)!))}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weight over the last 8 weeks, ${fmt(lo + 0.5, 1)} to ${fmt(hi - 0.5, 1)} ${u.wu}`}>
      {pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(u.wNum(p.kg))} r="3" fill="var(--muted)" opacity="0.6" />)}
      <polyline points={avgLine} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      <text x="10" y="12" fontSize="10" fill="var(--muted)">{fmt(hi - 0.5, 1)} {u.wu}</text>
      <text x="10" y={H - 2} fontSize="10" fill="var(--muted)">{fmt(lo + 0.5, 1)} {u.wu} · dots = weigh-ins, line = 7-day avg; gaps are days not logged</text>
    </svg>
  );
}
