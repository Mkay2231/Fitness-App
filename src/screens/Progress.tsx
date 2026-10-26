import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type WeightLog } from '../db';
import { exerciseHistory, today } from '../data';
import { addDays, daysBetween } from '../rules/dates';
import { fmtRate } from '../rules/nutrition';
import { bestOneRepMax } from '../rules/progression';
import { sevenDayAverage, weeklyRate } from '../rules/trend';
import { Icon } from '../icons';
import { Empty, fmt, fmtDate } from '../ui';

const SITES = ['Waist (at navel)', 'Chest', 'Upper arm (flexed)', 'Thigh', 'Hips'];

export default function Progress() {
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray()) ?? [];
  const measurements = useLiveQuery(() => db.measurements.orderBy('date').toArray()) ?? [];
  const lifts = useLiveQuery(async () => {
    const sets = await db.sets.toArray();
    const ids = [...new Set(sets.map((s) => s.exerciseId))];
    const names = new Map((await db.exercises.toArray()).map((e) => [e.id, e.name]));
    return Promise.all(ids.map(async (id) => ({ id, name: names.get(id) ?? id, history: await exerciseHistory(id) })));
  }) ?? [];

  const [wDate, setWDate] = useState(today());
  const [wKg, setWKg] = useState('');
  const [site, setSite] = useState(SITES[0]);
  const [cm, setCm] = useState('');

  const d = today();
  const avg = sevenDayAverage(weights, d);
  const rate = weeklyRate(weights, d);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Progress</h1>
        <p className="meta">Body weight, measurements and lifts. Only what you have recorded.</p>
      </header>

      <section className="card" aria-label="Body weight">
        <h2>Body weight</h2>
        <form className="form-grid" onSubmit={async (e) => {
          e.preventDefault();
          const kg = +wKg.replace(',', '.');
          if (kg >= 30 && kg <= 250 && wDate) { await db.weights.put({ date: wDate, kg }); setWKg(''); }
        }}>
          <div><label htmlFor="w-date">Date</label><input id="w-date" type="date" value={wDate} max={d} onChange={(e) => setWDate(e.target.value)} /></div>
          <div><label htmlFor="w-kg">Weight (kg)</label><input id="w-kg" inputMode="decimal" placeholder="e.g. 62.4" value={wKg} onChange={(e) => setWKg(e.target.value)} /></div>
          <button type="submit">Save</button>
        </form>
        {weights.length === 0 ? (
          <p className="muted small" style={{ marginTop: 8 }}>No weigh-ins yet. Daily weight moves up and down with water and food; the 7-day average and trend appear after a few entries.</p>
        ) : (
          <>
            <div className="kpis" style={{ marginTop: 10 }}>
              <div className="kpi"><div className="v">{avg !== null ? `${fmt(avg, 1)} kg` : '–'}</div><div className="l">7-day average{avg === null ? ' (none this week)' : ''}</div></div>
              <div className="kpi"><div className="v">{rate !== null ? fmtRate(rate) : '–'}</div><div className="l">{rate !== null ? '14-day trend' : 'Trend needs 8 weigh-ins over 10+ days'}</div></div>
            </div>
            <WeightChart weights={weights} />
            <details><summary className="small">All weigh-ins ({weights.length})</summary>
              <ul className="list">{[...weights].reverse().map((w) => (
                <li key={w.date} className="row between"><span>{fmtDate(w.date)}</span><span className="num">{fmt(w.kg, 1)} kg</span>
                  <button className="ghost danger icon-btn" onClick={() => db.weights.delete(w.date)} aria-label={`Delete weigh-in for ${w.date}`}><Icon name="trash" size="sm" /></button></li>
              ))}</ul>
            </details>
          </>
        )}
      </section>

      <section className="card" aria-label="Measurements">
        <h2>Measurements</h2>
        <p className="muted small">Every 2–4 weeks, same time of day, tape snug but not tight. Stored only on this device.</p>
        <form className="form-grid" onSubmit={async (e) => {
          e.preventDefault();
          const v = +cm.replace(',', '.');
          if (v > 0 && v < 300) { await db.measurements.add({ date: d, site, cm: v }); setCm(''); }
        }}>
          <div><label htmlFor="m-site">Where</label><select id="m-site" value={site} onChange={(e) => setSite(e.target.value)}>{SITES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label htmlFor="m-cm">Centimetres</label><input id="m-cm" inputMode="decimal" placeholder="e.g. 78.5" value={cm} onChange={(e) => setCm(e.target.value)} /></div>
          <button type="submit">Add</button>
        </form>
        {measurements.length === 0 ? <p className="muted small" style={{ marginTop: 8 }}>No measurements yet.</p> : (
          <ul className="list" style={{ marginTop: 8 }}>
            {SITES.filter((s) => measurements.some((m) => m.site === s)).map((s) => {
              const ms = measurements.filter((m) => m.site === s);
              const first = ms[0], last = ms[ms.length - 1];
              return (
                <li key={s} className="row between">
                  <span>{s}</span>
                  <span className="num">{fmt(last.cm, 1)} cm {ms.length > 1 && <span className="muted small">({last.cm - first.cm >= 0 ? '+' : ''}{fmt(last.cm - first.cm, 1)} since {fmtDate(first.date)})</span>}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Lifts">
        <h2>Lifts</h2>
        {lifts.filter((l) => l.history.length > 0).length === 0 ? (
          <Empty title="No finished workouts yet">Each exercise's best set and estimated 1-rep max appear here after you finish a workout.</Empty>
        ) : lifts.filter((l) => l.history.length > 0).map((l) => {
          const latest = bestOneRepMax(l.history[0].sets);
          const first = bestOneRepMax(l.history[l.history.length - 1].sets);
          return (
            <details key={l.id} className="card">
              <summary className="row between" style={{ width: '100%' }}>
                <span>{l.name}</span>
                <span className="muted small num">{latest !== null ? `e1RM ${fmt(latest, 1)} kg` : `${l.history.length} sessions`}
                  {latest !== null && first !== null && l.history.length > 1 ? ` (${latest - first >= 0 ? '+' : ''}${fmt(latest - first, 1)})` : ''}</span>
              </summary>
              <ul className="list">
                {l.history.map((h, i) => (
                  <li key={i} className="row between small">
                    <span>{fmtDate(h.date)}</span>
                    <span className="num">{h.sets.map((s) => `${s.weightKg ?? 'BW'}×${s.reps}`).join(', ')}</span>
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

function WeightChart({ weights }: { weights: WeightLog[] }) {
  const end = today();
  const start = addDays(end, -55);
  const pts = weights.filter((w) => w.date >= start);
  if (pts.length < 2) return null;
  const kgs = pts.map((p) => p.kg);
  const lo = Math.min(...kgs) - 0.5, hi = Math.max(...kgs) + 0.5;
  const W = 320, H = 140;
  const x = (date: string) => (daysBetween(start, date) / 55) * (W - 20) + 10;
  const y = (kg: number) => H - 10 - ((kg - lo) / (hi - lo)) * (H - 20);
  const avgLine = pts.map((p) => { const a = sevenDayAverage(weights, p.date)!; return `${x(p.date)},${y(a)}`; }).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weight over the last 8 weeks, ${fmt(lo + 0.5, 1)} to ${fmt(hi - 0.5, 1)} kg`}>
      {pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r="3" fill="var(--muted)" opacity="0.6" />)}
      <polyline points={avgLine} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      <text x="10" y="12" fontSize="10" fill="var(--muted)">{fmt(hi - 0.5, 1)} kg</text>
      <text x="10" y={H - 2} fontSize="10" fill="var(--muted)">{fmt(lo + 0.5, 1)} kg · dots = weigh-ins, line = 7-day avg</text>
    </svg>
  );
}
