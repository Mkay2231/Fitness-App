// Plain-language explanations of every term the app uses.

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../icons';
import { resetTips } from '../tips';
import { Welcome } from './Onboarding';

const TERMS: { id: string; group: string; title: string; text: string[] }[] = [
  { id: 'target', group: 'Workouts', title: "Today's target", text: [
    'The weight and reps to aim for on each exercise today, worked out from what you logged last time.',
    'Your first time on an exercise there is no target weight: pick one you can lift for the whole rep range with good form, and start light.',
  ] },
  { id: 'rep-range', group: 'Workouts', title: 'Sets and rep range', text: [
    'A set is a group of reps done without stopping. “3 × 8–12” means 3 sets of 8 to 12 reps.',
    'Stay at a weight and add reps until every set reaches the top of the range (12 here). Then the weight goes up and you start again at the bottom.',
  ] },
  { id: 'rir', group: 'Workouts', title: 'Reps in reserve', text: [
    'How many more reps you could have done before you had to stop. 0 means you could not do another; 2 means two more were possible.',
    'Most sets should end with about 2 in reserve: hard, but with good form. Logging it is optional.',
  ] },
  { id: 'progression', group: 'Workouts', title: 'When the weight goes up (or down)', text: [
    'Up: every set reached the top of the rep range last time. It goes up by the smallest weight jump set in Settings.',
    'Same: you are still adding reps, you missed a set, or it has been 2+ weeks since you last did the exercise.',
    'Down about 10%: two sessions in a row below the range, or 4+ weeks off.',
  ] },
  { id: 'rest', group: 'Workouts', title: 'Rest timer', text: [
    'Starts when you log a set and counts down the rest for that exercise. Tap Skip if you are ready sooner, or +30s for more.',
  ] },
  { id: 'swap', group: 'Workouts', title: 'Swapping an exercise', text: [
    'If a machine is busy or something hurts, swap for another exercise that works the same muscle. Choose today only, or update your plan.',
    'Each exercise keeps its own history, so numbers are never mixed between exercises.',
  ] },
  { id: 'complete-day', group: 'Food', title: 'Complete food day', text: [
    'Tap “I’ve logged everything I ate” once the day is fully logged. Only complete days are used for averages and calorie advice.',
    'A day with some food logged but not marked complete is left out, because a half-logged day would make your eating look lower than it was.',
  ] },
  { id: 'measures', group: 'Food', title: 'Spoons, cups and wraps', text: [
    'Household measures turn a spoon or wrap into grams. Sizes differ between homes, so weigh your own spoon or wrap once on a kitchen scale and save it as “I weighed it”.',
    'For eba, log the dry garri you used: the water adds weight but no calories.',
  ] },
  { id: 'calories', group: 'Food', title: 'Calories and protein targets', text: [
    'Calories are the energy to grow: what you burn plus a little extra. Protein builds muscle; about 1.8 g per kg of body weight.',
    'Both start as estimates. After 2–3 weeks of weigh-ins and complete food days, the weekly review checks them against your real weight change.',
  ] },
  { id: 'average-weight', group: 'Progress', title: '7-day average weight', text: [
    'Your weight swings up and down each day with water and food. The average of the last 7 days shows the real direction.',
  ] },
  { id: 'trend', group: 'Progress', title: 'Weight trend', text: [
    'How fast your weight is changing, per week, over the last 14 days. It needs at least 8 weigh-ins spread over 10 days.',
    'Scale weight includes water, food and fat as well as muscle, so a rising trend alone does not prove muscle gain.',
  ] },
  { id: 'e1rm', group: 'Progress', title: 'Estimated max', text: [
    'A rough guess of the heaviest weight you could lift once, worked out from your best set. It is a strength score for tracking, not a number to test.',
  ] },
  { id: 'suggestions', group: 'Review', title: 'Suggestions: Accept, Keep current, Noted', text: [
    'Plan changes (calories, protein) only happen if you tap Accept. Keep current says no; both are saved with the date.',
    'Other suggestions are things to do, like logging a few more days. Tap Noted.',
  ] },
  { id: 'missing', group: 'Review', title: 'Missing data', text: [
    'Days you did not log are shown as missing, never as zero. With too little data the review keeps your plan the same and asks for more records.',
  ] },
];

export default function Help() {
  const { hash } = useLocation();
  const [tour, setTour] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  if (tour) return <Welcome onDone={() => setTour(false)} doneLabel="Back to help" />;

  const groups = [...new Set(TERMS.map((t) => t.group))];
  return (
    <div className="page">
      <header className="page-head">
        <h1>Help</h1>
        <p className="meta">What the words in the app mean, in plain language.</p>
      </header>

      <section className="panel">
        <h2>Getting started again</h2>
        {msg && <p className="notice" role="status" style={{ marginTop: 8 }}><Icon name="check" size="sm" />{msg}</p>}
        <div className="stack" style={{ marginTop: 10 }}>
          <button className="block" onClick={() => setTour(true)}>See the welcome screens</button>
          <button className="block" onClick={() => { resetTips(); setMsg('Screen guides will show again on each tab.'); }}>Show screen guides again</button>
        </div>
      </section>

      {groups.map((g) => (
        <section key={g} className="panel" aria-labelledby={`g-${g}`}>
          <h2 id={`g-${g}`}>{g}</h2>
          {TERMS.filter((t) => t.group === g).map((t) => (
            <div key={t.id} id={t.id} className={`help-term${hash === `#${t.id}` ? ' is-target' : ''}`}>
              <h3>{t.title}</h3>
              {t.text.map((p) => <p key={p}>{p}</p>)}
            </div>
          ))}
        </section>
      ))}

      <p className="muted small">Something still unclear? Your settings and data controls are in <Link to="/settings">Settings</Link>.</p>
    </div>
  );
}
