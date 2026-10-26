import { useState } from 'react';
import { db, type Settings } from '../db';
import { activateProgram, nowISO, today } from '../data';
import { initialTargets, type Activity, type Sex } from '../rules/nutrition';
import { Icon } from '../icons';
import { Chips, Reasons } from '../ui';

export const WEEKDAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 7, label: 'Sun' },
];

export const ACTIVITY_OPTIONS: { value: Activity; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Mostly sitting', hint: 'Desk work, little walking' },
  { value: 'light', label: 'Lightly active', hint: 'Some walking most days' },
  { value: 'moderate', label: 'Active', hint: 'On your feet a lot, or training 3+ days' },
  { value: 'high', label: 'Very active', hint: 'Physical job plus training' },
];

export const DEFAULT_INCREMENTS: Settings['increments'] = { barbell: 2.5, dumbbell: 2, machine: 5, cable: 5, bodyweight: 0 };

export default function Onboarding() {
  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('62');
  const [activity, setActivity] = useState<Activity>('moderate');
  const [rate, setRate] = useState(0.4);
  const [setting, setSetting] = useState<'gym' | 'home'>('gym');
  const [days, setDays] = useState<number[]>([1, 3, 5]);

  const valid = sex && +age >= 14 && +age <= 90 && +height >= 120 && +height <= 230 && +weight >= 30 && +weight <= 250 && days.length >= 2;
  const preview = valid
    ? initialTargets({ sex: sex!, age: +age, heightCm: +height, weightKg: +weight, activity, gainRatePctPerWeek: rate })
    : null;

  async function save() {
    if (!preview || !sex) return;
    const createdAt = nowISO();
    await db.transaction('rw', db.settings, db.targets, db.programs, async () => {
      await db.targets.add({ effectiveFrom: today(), ...preview.targets, reasons: preview.reasons, createdAt });
      await activateProgram(setting === 'gym' ? 'gym-full-body' : 'home-full-body');
      await db.settings.put({
        id: 'me', sex, age: +age, heightCm: +height, startWeightKg: +weight, activity,
        gainRatePctPerWeek: rate, trainingDays: [...days].sort(), increments: DEFAULT_INCREMENTS, aiEnabled: false, createdAt,
      });
    });
  }

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <>
      <header className="page-head">
        <div className="row" style={{ gap: 10, marginBottom: 16, fontWeight: 680 }}>
          <span className="brand-mark" style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="train" size="sm" /></span>
          Rep Ledger
        </div>
        <h1>Set up</h1>
        <p className="meta">These details give you starting calorie and protein estimates and a beginner program. You can change all of it later.</p>
      </header>

      <div className="card">
        <div className="field">
          <label>Sex <span className="hint">(used in the resting-energy formula)</span></label>
          <Chips label="Sex" value={sex} onChange={setSex} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        </div>
        <div className="row">
          <div className="field grow"><label htmlFor="age">Age</label><input id="age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></div>
          <div className="field grow"><label htmlFor="h">Height (cm)</label><input id="h" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} /></div>
          <div className="field grow"><label htmlFor="w">Weight (kg)</label><input id="w" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
        </div>
        <div className="field">
          <label htmlFor="act">Daily activity outside training</label>
          <select id="act" value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
            {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}: {o.hint}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Gain rate</label>
          <Chips label="Gain rate" value={rate} onChange={setRate} options={[
            { value: 0.25, label: 'Slow 0.25%/wk' }, { value: 0.4, label: 'Steady 0.4%/wk' }, { value: 0.5, label: 'Faster 0.5%/wk' },
          ]} />
          <div className="hint">Of body weight per week. Beginners gain muscle well at 0.25–0.5%; faster mostly adds fat.</div>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label>Where will you train?</label>
          <Chips label="Training location" value={setting} onChange={setSetting} options={[
            { value: 'gym', label: 'Gym' }, { value: 'home', label: 'Home (dumbbells + bench)' },
          ]} />
          <div className="hint">Not decided? Pick Gym. A basic gym gives you more weights and small jumps for less money than buying equipment. You can switch later.</div>
        </div>
        <div className="field">
          <label>Training days</label>
          <div className="chips" role="group" aria-label="Training days">
            {WEEKDAYS.map((d) => (
              <button key={d.value} type="button" className="chip" aria-pressed={days.includes(d.value)} onClick={() => toggleDay(d.value)}>{d.label}</button>
            ))}
          </div>
          <div className="hint">3 non-consecutive days (e.g. Mon/Wed/Fri) works best. Sessions take about 50–60 minutes.</div>
        </div>
      </div>

      {preview ? (
        <div className="card">
          <h2>Starting targets (estimates)</h2>
          <div className="kpis">
            <div className="kpi"><div className="v">{preview.targets.calories}</div><div className="l">kcal / day</div></div>
            <div className="kpi"><div className="v">{preview.targets.proteinG} g</div><div className="l">protein</div></div>
            <div className="kpi"><div className="v">{preview.targets.carbsG} g</div><div className="l">carbs</div></div>
            <div className="kpi"><div className="v">{preview.targets.fatG} g</div><div className="l">fat</div></div>
          </div>
          <details><summary>How this was calculated</summary><Reasons items={preview.reasons} /></details>
        </div>
      ) : (
        <p className="muted small">Fill in sex, age, height and weight, and pick at least 2 training days, to see your targets.</p>
      )}

      <button className="primary block" disabled={!preview} onClick={save}>Save and start</button>
    </>
  );
}
