// One form for setup and for editing your profile. Every question says what the app uses it for.

import { useState, type ReactNode } from 'react';
import type { Settings } from '../db';
import { AVOID_LABELS, type AvoidCategory } from '../rules/foodPrefs';
import type { Activity, Sex } from '../rules/nutrition';
import { LIMITATION_LABELS, type Experience, type Limitation, type Setting } from '../rules/program';
import { fromLength, fromWeight, tidy, toLength, toWeight, type LengthUnit, type WeightUnit } from '../rules/units';
import { Chips } from '../ui';

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

export const GOALS = [
  { value: 0.25, label: 'Lean gain', hint: 'Build muscle with as little fat as possible: about 0.25% of body weight a week.' },
  { value: 0.4, label: 'Steady gain', hint: 'A good default for beginners: about 0.4% a week.' },
  { value: 0.5, label: 'Faster gain', hint: 'About 0.5% a week. Quicker, with more fat along the way.' },
  { value: 0, label: 'Recomposition', hint: 'Hold your weight; build muscle slowly while losing a little fat.' },
];

const EXPERIENCE: { value: Experience; label: string; hint: string }[] = [
  { value: 'new', label: 'New to lifting', hint: 'Never trained regularly. Sets stop 3 reps short while you learn.' },
  { value: 'some', label: 'Some experience', hint: 'Trained before, or for less than a year.' },
  { value: 'experienced', label: 'A year or more', hint: 'Trained consistently. Main lifts get an extra set.' },
];

const EQUIPMENT: { value: Setting; label: string; hint: string }[] = [
  { value: 'gym', label: 'Gym', hint: 'Machines, cables and dumbbells. Best if you can afford a basic gym.' },
  { value: 'home', label: 'Home', hint: 'Adjustable dumbbells and a bench or sturdy chair.' },
];

export interface ProfileDraft {
  gainRatePctPerWeek: number;
  sex: Sex | null;
  age: string;
  height: string;
  weight: string;
  activity: Activity;
  experience: Experience;
  setting: Setting;
  trainingDays: number[];
  sessionMinutes: number;
  limitations: Limitation[];
  avoidFoods: AvoidCategory[];
  weightUnit: WeightUnit;
  lengthUnit: LengthUnit;
}

export const EMPTY_DRAFT: ProfileDraft = {
  gainRatePctPerWeek: 0.4, sex: null, age: '', height: '', weight: '', activity: 'moderate',
  experience: 'new', setting: 'gym', trainingDays: [1, 3, 5], sessionMinutes: 60,
  limitations: [], avoidFoods: [], weightUnit: 'kg', lengthUnit: 'cm',
};

export function draftFromSettings(s: Settings): ProfileDraft {
  return {
    gainRatePctPerWeek: s.gainRatePctPerWeek, sex: s.sex, age: String(s.age),
    height: String(tidy(toLength(s.heightCm, s.lengthUnit), 1)),
    weight: String(tidy(toWeight(s.startWeightKg, s.weightUnit), 1)),
    activity: s.activity, experience: s.experience, setting: s.setting, trainingDays: s.trainingDays,
    sessionMinutes: s.sessionMinutes, limitations: s.limitations, avoidFoods: s.avoidFoods,
    weightUnit: s.weightUnit, lengthUnit: s.lengthUnit,
  };
}

const n = (s: string) => Number(s.replace(',', '.'));

export function validate(d: ProfileDraft, askWeight: boolean): Partial<Record<keyof ProfileDraft, string>> {
  const e: Partial<Record<keyof ProfileDraft, string>> = {};
  if (!d.sex) e.sex = 'Choose one. The calorie formula differs by sex.';
  if (!(n(d.age) >= 14 && n(d.age) <= 90)) e.age = 'Enter your age in years (14–90).';
  const cm = fromLength(n(d.height), d.lengthUnit);
  if (!(cm >= 120 && cm <= 230)) e.height = d.lengthUnit === 'cm' ? 'Enter your height in cm (120–230).' : 'Enter your height in inches (47–90).';
  if (askWeight) {
    const kg = fromWeight(n(d.weight), d.weightUnit);
    if (!(kg >= 30 && kg <= 250)) e.weight = d.weightUnit === 'kg' ? 'Enter your weight in kg (30–250).' : 'Enter your weight in lb (66–550).';
  }
  if (d.trainingDays.length < 2) e.trainingDays = 'Pick at least 2 days. 3 non-consecutive days works best.';
  return e;
}

/** Converts the form to stored values (kg, cm). */
export function profileValues(d: ProfileDraft) {
  return {
    sex: d.sex!, age: Math.round(n(d.age)), heightCm: tidy(fromLength(n(d.height), d.lengthUnit), 1),
    weightKg: tidy(fromWeight(n(d.weight), d.weightUnit), 2),
    activity: d.activity, gainRatePctPerWeek: d.gainRatePctPerWeek, experience: d.experience, setting: d.setting,
    trainingDays: [...d.trainingDays].sort(), sessionMinutes: d.sessionMinutes, limitations: d.limitations,
    avoidFoods: d.avoidFoods, weightUnit: d.weightUnit, lengthUnit: d.lengthUnit,
  };
}

function Choice<T extends string | number>({ name, options, value, onChange }: {
  name: string; options: { value: T; label: string; hint: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="choices" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className="choice" onClick={() => onChange(o.value)}>
          <span className="choice-title">{o.label}</span>
          <span className="choice-hint">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

function toggle<T>(list: T[], v: T) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Field({ id, label, why, error, children }: { id?: string; label: string; why?: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      {id ? <label htmlFor={id}>{label}</label> : <div className="label" id={`${label}-lbl`}>{label}</div>}
      {children}
      {error ? <p className="hint error-text" role="alert">{error}</p> : why ? <p className="hint">{why}</p> : null}
    </div>
  );
}

export default function ProfileForm({ initial, askWeight, submitLabel, onSubmit, aside }: {
  initial: ProfileDraft;
  askWeight: boolean;
  submitLabel: string;
  onSubmit: (d: ProfileDraft) => Promise<void>;
  /** Live preview rendered above the submit button (e.g. starting targets). */
  aside?: (d: ProfileDraft, valid: boolean) => ReactNode;
}) {
  const [d, setD] = useState(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errors = validate(d, askWeight);
  const valid = Object.keys(errors).length === 0;
  const shown = tried ? errors : {};
  const set = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  // Switching units converts what's already typed.
  function setWeightUnit(u: WeightUnit) {
    if (u === d.weightUnit) return;
    const v = n(d.weight);
    setD((cur) => ({ ...cur, weightUnit: u, weight: d.weight && v > 0 ? String(tidy(toWeight(fromWeight(v, cur.weightUnit), u), 1)) : cur.weight }));
  }
  function setLengthUnit(u: LengthUnit) {
    if (u === d.lengthUnit) return;
    const v = n(d.height);
    setD((cur) => ({ ...cur, lengthUnit: u, height: d.height && v > 0 ? String(tidy(toLength(fromLength(v, cur.lengthUnit), u), 1)) : cur.height }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!valid) {
      document.querySelector<HTMLElement>('[aria-invalid="true"], .error-text')?.scrollIntoView({ block: 'center' });
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(d);
    } catch (err) {
      setError(`Couldn't save: ${(err as Error).message || 'unknown error'}. Your answers are still here; try again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <section className="panel" aria-labelledby="goal-h">
        <h2 id="goal-h">Goal</h2>
        <p className="hint" style={{ marginTop: 2, marginBottom: 12 }}>Sets your calorie surplus and the weight trend the weekly review aims for.</p>
        <Choice name="Goal" options={GOALS} value={d.gainRatePctPerWeek} onChange={(v) => set('gainRatePctPerWeek', v)} />
      </section>

      <section className="panel" aria-labelledby="units-h">
        <h2 id="units-h">Units</h2>
        <div className="form-row" style={{ marginTop: 12 }}>
          <Field label="Weight"><Chips label="Weight unit" value={d.weightUnit} onChange={setWeightUnit} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} /></Field>
          <Field label="Height and measurements"><Chips label="Length unit" value={d.lengthUnit} onChange={setLengthUnit} options={[{ value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }]} /></Field>
        </div>
      </section>

      <section className="panel" aria-labelledby="body-h">
        <h2 id="body-h">About you</h2>
        <p className="hint" style={{ marginTop: 2, marginBottom: 12 }}>Used only to estimate your starting calories (Mifflin-St Jeor) and protein.</p>
        <Field label="Sex" error={shown.sex}>
          <Chips label="Sex" value={d.sex} onChange={(v) => set('sex', v)} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        </Field>
        <div className="form-row">
          <Field id="p-age" label="Age" error={shown.age}>
            <input id="p-age" inputMode="numeric" autoComplete="off" value={d.age} aria-invalid={!!shown.age} onChange={(e) => set('age', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field id="p-height" label={`Height (${d.lengthUnit})`} error={shown.height}>
            <input id="p-height" inputMode="decimal" autoComplete="off" value={d.height} aria-invalid={!!shown.height} onChange={(e) => set('height', e.target.value)} />
          </Field>
          {askWeight && (
            <Field id="p-weight" label={`Weight (${d.weightUnit})`} error={shown.weight}>
              <input id="p-weight" inputMode="decimal" autoComplete="off" value={d.weight} aria-invalid={!!shown.weight} onChange={(e) => set('weight', e.target.value)} />
            </Field>
          )}
        </div>
        <Field id="p-activity" label="Daily activity outside training">
          <select id="p-activity" value={d.activity} onChange={(e) => set('activity', e.target.value as Activity)}>
            {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}: {o.hint}</option>)}
          </select>
        </Field>
      </section>

      <section className="panel" aria-labelledby="train-h">
        <h2 id="train-h">Training</h2>
        <p className="hint" style={{ marginTop: 2, marginBottom: 12 }}>These build your program: exercises, sets and how hard to push.</p>
        <Field label="Experience"><Choice name="Experience" options={EXPERIENCE} value={d.experience} onChange={(v) => set('experience', v)} /></Field>
        <Field label="Where you train"><Choice name="Where you train" options={EQUIPMENT} value={d.setting} onChange={(v) => set('setting', v)} /></Field>
        <Field label="Training days" error={shown.trainingDays} why="Today shows a session on these days and a rest day otherwise.">
          <div className="chips" role="group" aria-label="Training days">
            {WEEKDAYS.map((w) => (
              <button key={w.value} type="button" className="chip" aria-pressed={d.trainingDays.includes(w.value)} onClick={() => set('trainingDays', toggle(d.trainingDays, w.value))}>{w.label}</button>
            ))}
          </div>
        </Field>
        <Field label="Session length" why="Shorter sessions drop accessory exercises first, then a set from the main lifts.">
          <Chips label="Session length" value={d.sessionMinutes} onChange={(v) => set('sessionMinutes', v)} options={[30, 45, 60, 75].map((m) => ({ value: m, label: `${m} min` }))} />
        </Field>
        <Field label="Anything that hurts or limits you?" why="Exercises that commonly aggravate these are swapped, and the workout says why. This isn't medical advice; see a physiotherapist for pain that persists.">
          <div className="chips" role="group" aria-label="Limitations">
            {(Object.keys(LIMITATION_LABELS) as Limitation[]).map((l) => (
              <button key={l} type="button" className="chip" aria-pressed={d.limitations.includes(l)} onClick={() => set('limitations', toggle(d.limitations, l))}>{LIMITATION_LABELS[l]}</button>
            ))}
          </div>
        </Field>
      </section>

      <section className="panel" aria-labelledby="food-h">
        <h2 id="food-h">Food</h2>
        <Field label="Foods you don't eat" why="Hidden from food search and meal ideas. You can still show everything when searching.">
          <div className="chips" role="group" aria-label="Foods you don't eat">
            {(Object.keys(AVOID_LABELS) as AvoidCategory[]).map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={d.avoidFoods.includes(c)} onClick={() => set('avoidFoods', toggle(d.avoidFoods, c))}>{AVOID_LABELS[c]}</button>
            ))}
          </div>
        </Field>
      </section>

      {aside?.(d, valid)}

      {error && <p className="hint error-text" role="alert" style={{ marginBottom: 12 }}>{error}</p>}
      {tried && !valid && <p className="hint error-text" role="alert" style={{ marginBottom: 12 }}>Some answers need fixing; they're marked above.</p>}
      <button type="submit" className="primary lg block" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
