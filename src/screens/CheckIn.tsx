// Optional daily check-in: sleep, energy and soreness. Used only by the weekly
// review to explain performance changes; blank answers stay blank.

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db';
import { Icon } from '../icons';
import type { CheckIn as CheckInRecord } from '../rules/review';
import { Chips } from '../ui';

const SCALE = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }));

export default function CheckIn({ date }: { date: string }) {
  const saved = useLiveQuery(async () => (await db.checkins.get(date)) ?? null, [date]);
  const [editing, setEditing] = useState(false);
  const [sleep, setSleep] = useState('');
  const [energy, setEnergy] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [error, setError] = useState('');

  if (saved === undefined) return <p className="muted small" role="status">Loading check-in…</p>;

  function start(rec: CheckInRecord | null) {
    setSleep(rec?.sleepHours != null ? String(rec.sleepHours) : '');
    setEnergy(rec?.energy ?? null);
    setSoreness(rec?.soreness ?? null);
    setError('');
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const hours = sleep.trim() === '' ? null : Number(sleep.replace(',', '.'));
    if (hours !== null && !(hours >= 0 && hours <= 16)) { setError('Enter hours of sleep between 0 and 16, or leave it blank.'); return; }
    if (hours === null && energy === null && soreness === null) { setError('Answer at least one, or close the check-in.'); return; }
    await db.checkins.put({ date, sleepHours: hours, energy, soreness });
    setEditing(false);
  }

  if (!editing) {
    return (
      <button type="button" className="row-link ghost" style={{ width: '100%', padding: 0, justifyContent: 'flex-start', color: 'inherit', fontWeight: 400 }} onClick={() => start(saved)}>
        <Icon name="info" />
        <span className="grow" style={{ textAlign: 'left' }}>
          <span className="row-title">Check-in <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></span>
          <span className="row-sub" style={{ display: 'block' }}>
            {saved
              ? [saved.sleepHours != null && `Slept ${saved.sleepHours} h`, saved.energy != null && `energy ${saved.energy}/5`, saved.soreness != null && `soreness ${saved.soreness}/5`].filter(Boolean).join(' · ')
              : 'Sleep, energy and soreness help explain changes in your lifts.'}
          </span>
        </span>
        <Icon name={saved ? 'edit' : 'plus'} size="sm" />
      </button>
    );
  }

  return (
    <form onSubmit={save} noValidate style={{ padding: '4px 0' }}>
      <div className="field">
        <label htmlFor="ci-sleep">Hours of sleep last night</label>
        <input id="ci-sleep" inputMode="decimal" placeholder="e.g. 7.5" value={sleep} onChange={(e) => setSleep(e.target.value)} style={{ maxWidth: 160 }} />
      </div>
      <div className="field">
        <div className="label">Energy (1 very low, 5 very high)</div>
        <Chips label="Energy" value={energy} onChange={(v) => setEnergy(energy === v ? null : v)} options={SCALE} />
      </div>
      <div className="field">
        <div className="label">Muscle soreness (1 none, 5 very sore)</div>
        <Chips label="Soreness" value={soreness} onChange={(v) => setSoreness(soreness === v ? null : v)} options={SCALE} />
      </div>
      {error && <p className="hint error-text" role="alert">{error}</p>}
      <div className="row">
        <button type="submit" className="grow">Save check-in</button>
        <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </form>
  );
}
