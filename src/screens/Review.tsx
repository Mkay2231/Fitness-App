import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db';
import { nowISO, retarget, reviewFor, targetsOn, today } from '../data';
import { Icon } from '../icons';
import { HelpLink, ScreenTip } from '../tips';
import { addDays, weekStart } from '../rules/dates';
import type { PerformanceChange } from '../rules/performance';
import { MIN_COMPLETE_DAYS, type Recommendation } from '../rules/review';
import { Empty, Loading, Reasons, fmt, fmtDate } from '../ui';
import { useUnits } from '../units';

const STATUS_LABEL: Record<PerformanceChange['status'], string> = {
  up: 'Up', flat: 'About the same', down: 'Down', new: 'First record', 'not-comparable': "Can't compare",
};

export default function Review() {
  const u = useUnits();
  const [monday, setMonday] = useState(weekStart(today()));
  const review = useLiveQuery(() => reviewFor(monday), [monday]);
  const decisions = useLiveQuery(() => db.decisions.toArray());
  const [error, setError] = useState('');
  if (review === undefined || decisions === undefined) return <Loading label="Loading review" />;
  if (review === null) return <div className="page"><Empty title="No calorie targets yet">The review compares your week with your targets. Save your profile in Settings to create them.</Empty></div>;

  const isCurrent = monday === weekStart(today());
  const { training, volume, performance, nutrition, weight, measurements, wellbeing, gaps, conflicts, recommendations, summary } = review;

  async function decide(rec: Recommendation, status: 'accepted' | 'rejected' | 'noted') {
    setError('');
    try {
      await db.transaction('rw', db.decisions, db.targets, db.weights, async () => {
        if (status === 'accepted' && rec.type === 'change') {
          const cur = await targetsOn(today());
          if (!cur) throw new Error('No current targets to change.');
          const kg = weight.avg7 ?? (await db.weights.orderBy('date').last())?.kg ?? 0;
          const next = retarget(cur, rec.kind === 'calories' ? { calories: rec.to } : { proteinG: rec.to }, kg);
          await db.targets.add({ effectiveFrom: today(), ...next, reasons: [rec.title, ...rec.evidence, `Rule: ${rec.rule}`], createdAt: nowISO() });
        }
        await db.decisions.put({ key: rec.key, status, title: rec.title, reasons: [...rec.evidence, `Rule: ${rec.rule}`], decidedAt: nowISO() });
      });
    } catch (e) {
      setError(`That wasn't saved: ${(e as Error).message} Try again.`);
    }
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

      <ScreenTip id="review" />

      <section className="panel" aria-labelledby="brief-h">
        <h2 id="brief-h">This week in brief</h2>
        <ul className="reasons" style={{ color: 'var(--text)', fontSize: '1rem' }}>{summary.map((s) => <li key={s}>{s}</li>)}</ul>
        <p className="hint">Written from your saved records by fixed rules. AI summaries are off.</p>
      </section>

      <section className="panel" aria-labelledby="next-h">
        <h2 id="next-h">Suggested next steps</h2>
        {error && <p className="hint error-text" role="alert">{error}</p>}
        {recommendations.length === 0 ? (
          <p className="muted small" style={{ marginTop: 6 }}>Nothing to change or act on this week. Keep following the plan.</p>
        ) : recommendations.map((rec) => {
          const d = decisions.find((x) => x.key === rec.key);
          return (
            <article key={rec.key} className="suggestion" aria-labelledby={`rec-${rec.key}`}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <h3 id={`rec-${rec.key}`}>{rec.title}</h3>
                <span className={`tag${rec.type === 'change' ? ' warn' : ''}`}>{rec.type === 'change' ? 'Plan change' : 'To do'}</span>
              </div>
              <div className="small" style={{ fontWeight: 600, marginTop: 8 }}>Based on</div>
              <Reasons items={rec.evidence} />
              <details><summary className="small">The rule</summary><p className="small muted">{rec.rule}</p></details>
              {d ? (
                <p className="small" style={{ margin: '6px 0 0' }}>
                  <span className={`tag${d.status === 'accepted' ? ' ok' : ''}`}>{d.status === 'accepted' ? 'Accepted' : d.status === 'rejected' ? 'Kept current plan' : 'Noted'}</span>{' '}
                  {fmtDate(d.decidedAt.slice(0, 10))}
                </p>
              ) : rec.type === 'change' ? (
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="primary grow" onClick={() => decide(rec, 'accepted')}>Accept</button>
                  <button className="grow" onClick={() => decide(rec, 'rejected')}>Keep current</button>
                </div>
              ) : (
                <button style={{ marginTop: 10 }} onClick={() => decide(rec, 'noted')}><Icon name="check" size="sm" />Noted</button>
              )}
            </article>
          );
        })}
        <p className="hint">Suggestions come from fixed rules, not AI. Plan changes only happen when you accept them. <HelpLink term="suggestions">How suggestions work</HelpLink></p>
      </section>

      <section className="panel" aria-labelledby="training-h">
        <h2 id="training-h">Training</h2>
        <div className="kpis" style={{ marginTop: 8 }}>
          <div className="kpi"><div className="v">{training.completed.length + training.extra.length} / {training.planned.length}</div><div className="l">sessions done / planned</div></div>
          <div className="kpi"><div className="v">{training.missed.length}</div><div className="l">planned days not logged</div></div>
        </div>
        {training.missed.length > 0 && <p className="small" style={{ marginTop: 8 }}>Not logged: {training.missed.map((d) => fmtDate(d)).join(', ')}.</p>}
        {training.upcoming.length > 0 && <p className="muted small">Still to come: {training.upcoming.map((d) => fmtDate(d)).join(', ')}.</p>}

        <h3 style={{ marginTop: 16 }}>Lifts compared with their previous session</h3>
        {performance.length === 0 ? (
          <p className="muted small">No finished workouts this week, so nothing to compare.</p>
        ) : (
          <ul className="rows">
            {performance.map((p) => (
              <li key={p.exerciseId}>
                <div className="row between">
                  <span className="row-title">{p.name}</span>
                  <span className={`tag${p.status === 'up' ? ' ok' : p.status === 'down' ? ' warn' : ''}`}>
                    {STATUS_LABEL[p.status]}{p.changePct !== null && p.status !== 'flat' ? ` ${p.changePct > 0 ? '+' : '−'}${Math.abs(p.changePct).toFixed(1)}%` : ''}
                  </span>
                </div>
                <p className="small muted" style={{ margin: '2px 0 0' }}>{p.evidence}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">Each exercise is compared only with itself, by estimated 1-rep max (best-set reps for bodyweight work). Changes under 2% count as about the same.</p>
        {volume.length > 0 && (
          <details><summary className="small">Sets per muscle this week</summary>
            <ul className="list">{volume.map((v) => <li key={v.muscle} className="row between small"><span>{v.muscle}</span><span className="num">{fmt(v.sets, 1)}</span></li>)}</ul>
          </details>
        )}
      </section>

      <section className="panel" aria-labelledby="body-h">
        <h2 id="body-h">Body</h2>
        <div className="kpis" style={{ marginTop: 8 }}>
          <div className="kpi"><div className="v">{weight.avg7 !== null ? u.w(weight.avg7) : '–'}</div><div className="l">7-day average weight{weight.prevAvg7 !== null && weight.avg7 !== null ? ` (${weight.avg7 - weight.prevAvg7 >= 0 ? '+' : '−'}${fmt(Math.abs(u.wNum(weight.avg7) - u.wNum(weight.prevAvg7)), 2)} vs a week earlier)` : ''}</div></div>
          <div className="kpi"><div className="v">{weight.rateKgPerWeek !== null ? u.rate(weight.rateKgPerWeek) : '–'}</div><div className="l">14-day weight trend (per week) <HelpLink term="trend" /></div></div>
        </div>
        <p className="hint">Scale weight moves with water, food and fat as well as muscle, so a rising weight on its own doesn't show muscle gain. Lift trends and measurements together give a better picture. {weight.weighInsThisWeek} weigh-in{weight.weighInsThisWeek === 1 ? '' : 's'} this week.</p>
        {measurements.length > 0 && (
          <ul className="rows" style={{ marginTop: 4 }}>
            {measurements.map((m) => (
              <li key={m.site} className="row between small">
                <span>{m.site}</span>
                <span className="num">{u.l(m.latest.cm)} <span className="muted">({fmtDate(m.latest.date)}{m.previous ? `, ${m.latest.cm - m.previous.cm >= 0 ? '+' : '−'}${fmt(Math.abs(u.lNum(m.latest.cm) - u.lNum(m.previous.cm)), 1)} since ${fmtDate(m.previous.date)}` : ''})</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="food-h">
        <h2 id="food-h">Nutrition</h2>
        <p className="small" style={{ marginTop: 6 }}>{nutrition.completeDays} complete · {nutrition.partialDays} partial (left out) · {nutrition.notLoggedDays} not logged</p>
        {nutrition.sufficient ? (
          <div className="kpis">
            <div className="kpi"><div className="v">{fmt(nutrition.avgKcal!)}</div><div className="l">average kcal, complete days</div></div>
            <div className="kpi"><div className="v">{fmt(nutrition.avgProteinG!)} g</div><div className="l">average protein, complete days</div></div>
          </div>
        ) : (
          <p className="muted small">Averages appear with {MIN_COMPLETE_DAYS}+ complete days in the week, so a few logged meals don't stand in for what you really ate.</p>
        )}
        <p className="hint">Values are estimates from the cited food sources.</p>
      </section>

      <section className="panel" aria-labelledby="rec-h">
        <h2 id="rec-h">Recovery check-ins</h2>
        {wellbeing.entries === 0 ? (
          <p className="muted small" style={{ marginTop: 6 }}>None this week. They're optional; add one from Today to help explain changes in your lifts.</p>
        ) : (
          <div className="kpis" style={{ marginTop: 8, gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="kpi"><div className="v">{wellbeing.sleepAvg !== null ? `${fmt(wellbeing.sleepAvg, 1)} h` : '–'}</div><div className="l">sleep</div></div>
            <div className="kpi"><div className="v">{wellbeing.energyAvg !== null ? `${fmt(wellbeing.energyAvg, 1)}/5` : '–'}</div><div className="l">energy</div></div>
            <div className="kpi"><div className="v">{wellbeing.sorenessAvg !== null ? `${fmt(wellbeing.sorenessAvg, 1)}/5` : '–'}</div><div className="l">soreness</div></div>
          </div>
        )}
        {wellbeing.entries > 0 && <p className="hint">Averages of {wellbeing.entries} check-in{wellbeing.entries === 1 ? '' : 's'}; blank answers are left out.</p>}
      </section>

      <section className="panel" aria-labelledby="gaps-h">
        <h2 id="gaps-h">Missing data and uncertainty</h2>
        {gaps.length === 0 && conflicts.length === 0 ? (
          <p className="muted small" style={{ marginTop: 6 }}>Nothing missing this week.</p>
        ) : (
          <>
            {gaps.length > 0 && <Reasons items={gaps} />}
            {conflicts.length > 0 && (
              <>
                <h3 style={{ marginTop: 12 }}>Signals that don't agree</h3>
                <Reasons items={conflicts} />
              </>
            )}
          </>
        )}
      </section>

      <details className="panel">
        <summary>Decision history ({decisions.length})</summary>
        {decisions.length === 0 ? <p className="muted small">No decisions yet.</p> : (
          <ul className="rows">
            {[...decisions].sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1)).map((d) => (
              <li key={d.key} className="small">
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <span><strong>{d.title}</strong></span>
                  <span className={`tag${d.status === 'accepted' ? ' ok' : ''}`}>{d.status === 'accepted' ? 'Accepted' : d.status === 'rejected' ? 'Kept current' : 'Noted'}</span>
                </div>
                <span className="muted">Decided {fmtDate(d.decidedAt.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, for the week of {fmtDate(d.key.slice(0, 10), { day: 'numeric', month: 'short' })}</span>
                <details><summary className="small">Evidence at the time</summary><Reasons items={d.reasons} /></details>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
