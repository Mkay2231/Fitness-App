import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db';
import { nowISO, retarget, reviewFor, targetsOn, today } from '../data';
import { addDays, weekStart } from '../rules/dates';
import { useUnits } from '../units';
import type { Recommendation } from '../rules/review';
import { Icon } from '../icons';
import { Empty, Loading, Reasons, fmt, fmtDate } from '../ui';

export default function Review() {
  const u = useUnits();
  const [monday, setMonday] = useState(weekStart(today()));
  const review = useLiveQuery(() => reviewFor(monday), [monday]);
  const decisions = useLiveQuery(() => db.decisions.toArray()) ?? [];
  if (review === undefined) return <Loading label="Loading review" />;
  if (review === null) return <Empty title="Nothing to review yet">Finish setup first.</Empty>;

  const isCurrent = monday === weekStart(today());
  const { training, volume, nutrition, weight, calorieCheck, recommendations } = review;

  async function decide(rec: Recommendation, status: 'accepted' | 'rejected') {
    await db.transaction('rw', db.decisions, db.targets, db.weights, async () => {
      if (status === 'accepted') {
        const cur = await targetsOn(today());
        if (!cur) return;
        const kg = weight.avg7 ?? (await db.weights.orderBy('date').last())?.kg ?? 0;
        const next = retarget(cur, rec.kind === 'calories' ? { calories: rec.to } : { proteinG: rec.to }, kg);
        await db.targets.add({ effectiveFrom: today(), ...next, reasons: [rec.title, ...rec.reasons], createdAt: nowISO() });
      }
      await db.decisions.put({ key: rec.key, status, title: rec.title, reasons: rec.reasons, decidedAt: nowISO() });
    });
  }

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Review</h1>
          <p className="meta">Week of {fmtDate(monday, { day: 'numeric', month: 'long' })}{isCurrent ? `, in progress up to ${fmtDate(review.endDate, { weekday: 'long' })}` : ''}</p>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="ghost icon-btn" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}><Icon name="back" /></button>
          <button className="ghost icon-btn" aria-label="Next week" disabled={isCurrent} onClick={() => setMonday(addDays(monday, 7))}><Icon name="next" /></button>
        </div>
      </header>

      <section className="card" aria-label="Training">
        <h2>Training</h2>
        <div className="kpis">
          <div className="kpi"><div className="v">{training.completed.length + training.extra.length} / {training.planned.length}</div><div className="l">sessions done / planned</div></div>
          <div className="kpi"><div className="v">{training.missed.length}</div><div className="l">planned days not logged</div></div>
        </div>
        {training.missed.length > 0 && <p className="small" style={{ marginTop: 8 }}>Not logged: {training.missed.map((d) => fmtDate(d)).join(', ')}. If you trained but didn't log, it's not counted.</p>}
        {training.upcoming.length > 0 && <p className="muted small">Still to come: {training.upcoming.map((d) => fmtDate(d)).join(', ')}</p>}
        {volume.length > 0 ? (
          <details><summary className="small">Sets per muscle this week</summary>
            <ul className="list">{volume.map((v) => <li key={v.muscle} className="row between small"><span>{v.muscle}</span><span className="num">{fmt(v.sets, 1)}</span></li>)}</ul>
            <p className="hint">Main muscle = 1 set, helper muscles = ½. Beginners grow well on about 6–10 sets per muscle per week.</p>
          </details>
        ) : <p className="muted small" style={{ marginTop: 8 }}>No finished workouts this week.</p>}
      </section>

      <section className="card" aria-label="Nutrition">
        <h2>Nutrition</h2>
        <div className="kpis">
          <div className="kpi"><div className="v">{nutrition.avgKcal !== null ? fmt(nutrition.avgKcal) : '–'}</div><div className="l">avg kcal, complete days</div></div>
          <div className="kpi"><div className="v">{nutrition.avgProteinG !== null ? `${fmt(nutrition.avgProteinG)} g` : '–'}</div><div className="l">avg protein, complete days</div></div>
        </div>
        <p className="small" style={{ marginTop: 8 }}>
          {nutrition.completeDays} complete · {nutrition.partialDays} partial (excluded) · {nutrition.notLoggedDays} not logged
        </p>
      </section>

      <section className="card" aria-label="Body weight">
        <h2>Body weight</h2>
        <div className="kpis">
          <div className="kpi"><div className="v">{weight.avg7 !== null ? u.w(weight.avg7) : '–'}</div><div className="l">7-day average{weight.prevAvg7 !== null && weight.avg7 !== null ? ` (${weight.avg7 - weight.prevAvg7 >= 0 ? '+' : '−'}${fmt(Math.abs(u.wNum(weight.avg7) - u.wNum(weight.prevAvg7)), 2)} vs last week)` : ''}</div></div>
          <div className="kpi"><div className="v">{weight.rateKgPerWeek !== null ? u.rate(weight.rateKgPerWeek) : '–'}</div><div className="l">14-day trend</div></div>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>{weight.weighInsThisWeek} weigh-in{weight.weighInsThisWeek === 1 ? '' : 's'} this week.</p>
      </section>

      <section className="card" aria-label="Recommendations">
        <h2>Changes to consider</h2>
        {recommendations.length === 0 ? (
          <>
            <p className="small">{calorieCheck.kind === 'insufficient-data' ? 'Not enough data yet to suggest changes.' : 'No changes needed. Keep going.'}</p>
            <Reasons items={calorieCheck.reasons} />
          </>
        ) : recommendations.map((rec) => {
          const d = decisions.find((x) => x.key === rec.key);
          return (
            <div key={rec.key} className="card soft" style={{ padding: 12 }}>
              <h3>{rec.title}</h3>
              <Reasons items={rec.reasons} />
              {d ? (
                <p className="small" style={{ marginTop: 8 }}><span className={`badge ${d.status === 'accepted' ? 'ok' : ''}`}>{d.status === 'accepted' ? 'Accepted' : 'Rejected'}</span> {fmtDate(d.decidedAt.slice(0, 10))}</p>
              ) : (
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="primary grow" onClick={() => decide(rec, 'accepted')}>Accept</button>
                  <button className="grow" onClick={() => decide(rec, 'rejected')}>Keep current</button>
                </div>
              )}
            </div>
          );
        })}
        <p className="hint">Suggestions come from fixed rules, not AI. Nothing changes until you accept it.</p>
      </section>

      {decisions.length > 0 && (
        <details className="card">
          <summary>Decision history ({decisions.length})</summary>
          <ul className="list">{[...decisions].sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1)).map((d) => (
            <li key={d.key} className="small"><span className={`badge ${d.status === 'accepted' ? 'ok' : ''}`}>{d.status}</span> {d.title} <span className="muted">· {fmtDate(d.decidedAt.slice(0, 10))}</span></li>
          ))}</ul>
        </details>
      )}
    </div>
  );
}
