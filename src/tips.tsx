// "How this screen works" guides, shown the first time each screen opens.
// Dismissals are remembered on this device; Help can bring them back.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons';

export type TipId = 'today' | 'train' | 'workout' | 'food' | 'progress' | 'review';

const TIPS: Record<TipId, { title: string; points: string[]; help: string }> = {
  today: {
    title: 'Your daily home',
    points: [
      "The card shows today's workout. Each exercise has a target next to what you did last time.",
      'Tap Start workout at the gym. Every set saves as you go, even with no signal.',
      'Below it, log your weight in the morning and see how today’s eating is going.',
    ],
    help: 'target',
  },
  train: {
    title: 'Your plan and history',
    points: [
      'Your two workouts take turns on your training days.',
      'Recent workouts are listed here. Open one to fix a set you logged wrong.',
      'Edit programme lets you change exercises, sets and rest times.',
    ],
    help: 'rep-range',
  },
  workout: {
    title: 'Logging a set',
    points: [
      'Type the weight and reps you actually did, then tap the tick.',
      'Optional: tap how many more reps you could have done. This is called reps in reserve.',
      'The rest timer starts by itself. Tap a logged set’s tick to fix or delete it.',
      'Do all sets at the top of the rep range and the weight goes up next time.',
    ],
    help: 'rir',
  },
  food: {
    title: 'Planning and logging food',
    points: [
      'Plan shows what to eat today, sized to your targets. Tap “I ate this” to log a meal, or swap it.',
      'The week view has your shopping list and how much rice, beans and stew to cook ahead.',
      'Log is for anything else you ate: use spoons, cups or wraps, or grams if you weighed it.',
      'When the day is fully logged, tap “I’ve logged everything I ate”. Only complete days count in averages.',
      'Calories and protein are estimates from the food tables each food cites.',
    ],
    help: 'complete-day',
  },
  progress: {
    title: 'Seeing progress',
    points: [
      'Weigh in most mornings. The 7-day average smooths out daily ups and downs.',
      'Scale weight alone can’t show muscle. Rising strength and measurements help.',
      'Each lift shows an estimated max: a rough strength score from your best set.',
    ],
    help: 'average-weight',
  },
  review: {
    title: 'Your weekly check-in',
    points: [
      'Once a week, see what happened and what to do next.',
      'Each suggestion shows what it’s based on. Plan changes only happen if you tap Accept.',
      'Missing records are listed, never counted as zero.',
    ],
    help: 'suggestions',
  },
};

const key = (id: TipId) => `rl-tip-${id}`;

function seen(id: TipId): boolean {
  try { return localStorage.getItem(key(id)) === 'seen'; } catch { return false; }
}

export function resetTips() {
  try { (Object.keys(TIPS) as TipId[]).forEach((id) => localStorage.removeItem(key(id))); } catch { /* storage unavailable */ }
}

export function ScreenTip({ id }: { id: TipId }) {
  const [hidden, setHidden] = useState(() => seen(id));
  if (hidden) return null;
  const tip = TIPS[id];
  return (
    <aside className="screen-tip" aria-labelledby={`tip-${id}`}>
      <h2 id={`tip-${id}`}><Icon name="info" size="sm" />{tip.title}</h2>
      <ul>{tip.points.map((p) => <li key={p}>{p}</li>)}</ul>
      <div className="row wrap">
        <button className="primary" onClick={() => { try { localStorage.setItem(key(id), 'seen'); } catch { /* ignore */ } setHidden(true); }}>Got it</button>
        <Link className="btn ghost" to={`/help#${tip.help}`}>Explain the terms</Link>
      </div>
    </aside>
  );
}

/** Small inline link to a help entry, placed next to a term. */
export function HelpLink({ term, children = "What's this?" }: { term: string; children?: string }) {
  return <Link className="help-link" to={`/help#${term}`}>{children}</Link>;
}
