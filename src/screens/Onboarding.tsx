// First run: three short welcome screens (skippable), then setup one step at a time.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../cloud';
import { db } from '../db';
import { applyProgram, estimateMinutes, nowISO, programForProfile, today } from '../data';
import { Icon, type IconName } from '../icons';
import { initialTargets } from '../rules/nutrition';
import { defaultIncrements } from '../rules/units';
import { Reasons } from '../ui';
import { EMPTY_DRAFT, FIELD_SECTION, ProfileSections, profileValues, useProfileDraft, validate, type ProfileDraft, type SectionId } from './ProfileForm';

export { ACTIVITY_OPTIONS, WEEKDAYS } from './ProfileForm';

// ---------- Welcome ----------

const SLIDES: { title: string; body: string; visual: 'today' | 'loop' | 'privacy' }[] = [
  {
    title: 'Your training journal',
    body: 'Rep Ledger tells you what to lift today, remembers every set, and helps you eat enough to grow. It is built for beginners, so it explains each step.',
    visual: 'today',
  },
  {
    title: 'How it works',
    body: 'Three habits do the work. Each one takes a minute or two.',
    visual: 'loop',
  },
  {
    title: 'You stay in control',
    body: 'Nothing about your plan changes unless you agree to it.',
    visual: 'privacy',
  },
];

const LOOP: { icon: IconName; title: string; text: string }[] = [
  { icon: 'train', title: 'Train', text: "Follow today's workout and log each set with one tap." },
  { icon: 'food', title: 'Eat', text: 'Log meals with familiar foods, in spoons, cups or wraps.' },
  { icon: 'review', title: 'Review', text: 'Once a week, see what changed and what to do next.' },
];

const PROMISES: { icon: IconName; text: string }[] = [
  { icon: 'lock', text: 'Your records stay on this phone. An account is optional, only for backup and other devices.' },
  { icon: 'cloudOff', text: 'Works with no signal at the gym.' },
  { icon: 'check', text: 'Every suggestion shows why. Plan changes need your OK.' },
];

function ExampleToday() {
  // An illustration of the Today card, clearly labelled so it isn't mistaken for real data.
  return (
    <div className="welcome-example" aria-label="Example of the Today screen">
      <span className="tag">Example</span>
      <div className="welcome-example-card">
        <div style={{ fontWeight: 650 }}>Full body A</div>
        <div className="muted small">6 exercises · about 45 min</div>
        <ul className="plan" style={{ padding: 0 }}>
          <li><span className="ex-name">Leg press</span><span className="target">45 kg × 8</span><span className="ex-rx">3 × 8–12</span><span className="prev">Last 40 kg × 12, 12, 12</span></li>
          <li><span className="ex-name">Lat pulldown</span><span className="target">35 kg × 11</span><span className="ex-rx">3 × 8–12</span><span className="prev">Last 35 kg × 10, 10, 10</span></li>
        </ul>
      </div>
    </div>
  );
}

export function Welcome({ onDone, doneLabel = 'Set up my plan', offerSignIn = false }: { onDone: () => void; doneLabel?: string; offerSignIn?: boolean }) {
  const [i, setI] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [i]);
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div className="welcome">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 10, fontWeight: 680 }}>
          <span className="brand-mark-inline"><Icon name="train" size="sm" /></span>Rep Ledger
        </div>
        {!last && <button className="ghost" onClick={onDone}>Skip</button>}
      </div>

      <div className="welcome-visual" aria-hidden={slide.visual === 'today' ? undefined : true}>
        {slide.visual === 'today' && <ExampleToday />}
        {slide.visual === 'loop' && (
          <ol className="welcome-steps">
            {LOOP.map((s, n) => (
              <li key={s.title}>
                <span className="welcome-step-icon"><Icon name={s.icon} /></span>
                <span><strong>{n + 1}. {s.title}</strong><br /><span className="muted">{s.text}</span></span>
              </li>
            ))}
          </ol>
        )}
        {slide.visual === 'privacy' && (
          <ul className="welcome-steps">
            {PROMISES.map((p) => (
              <li key={p.text}><span className="welcome-step-icon"><Icon name={p.icon} /></span><span>{p.text}</span></li>
            ))}
          </ul>
        )}
      </div>

      <h1 ref={heading} tabIndex={-1} style={{ marginTop: 24 }}>{slide.title}</h1>
      <p className="welcome-body">{slide.body}</p>

      <div className="welcome-dots" aria-label={`Screen ${i + 1} of ${SLIDES.length}`} role="img">
        {SLIDES.map((_, n) => <span key={n} className={n === i ? 'on' : ''} />)}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        {i > 0 && <button onClick={() => setI(i - 1)}><Icon name="back" size="sm" />Back</button>}
        <button className="primary lg grow" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? doneLabel : 'Next'}</button>
      </div>
      {i === 0 && <p className="hint" style={{ textAlign: 'center' }}>Setup takes about 2 minutes.</p>}
      {offerSignIn && supabase && (
        <p className="small" style={{ textAlign: 'center', marginTop: 12 }}>Used Rep Ledger before? <Link to="/account">Sign in to restore your data</Link></p>
      )}
    </div>
  );
}

// ---------- Step-by-step setup ----------

const STEPS: { title: string; lead: string; sections: SectionId[] }[] = [
  { title: 'What do you want?', lead: 'Pick one. You can change it any time.', sections: ['goal'] },
  { title: 'A little about you', lead: 'This sets how much to eat. It stays on your phone unless you sign in to back it up.', sections: ['units', 'body'] },
  { title: 'How you train', lead: 'This builds your workout plan.', sections: ['training'] },
  { title: 'What you eat', lead: 'Your meal plan is built from the meals you pick here.', sections: ['food'] },
];

function Preview({ d }: { d: ProfileDraft }) {
  const v = profileValues(d);
  const { targets, reasons } = initialTargets({ ...v, weightKg: v.weightKg });
  const program = programForProfile(v);
  return (
    <>
      <section className="panel" aria-labelledby="eat-h">
        <h2 id="eat-h">Eat each day</h2>
        <div className="kpis" style={{ marginTop: 10 }}>
          <div className="kpi"><div className="v">{targets.calories.toLocaleString('en-NG')}</div><div className="l">calories (kcal)</div></div>
          <div className="kpi"><div className="v">{targets.proteinG} g</div><div className="l">protein</div></div>
        </div>
        <p className="hint">A starting estimate. After 2–3 weeks of weigh-ins and food logs, the weekly review checks it against your real progress.</p>
        <details><summary>How this was worked out</summary><Reasons items={reasons} /></details>
      </section>
      <section className="panel" aria-labelledby="train-plan-h">
        <h2 id="train-plan-h">Train {d.trainingDays.length} days a week</h2>
        <ul className="rows" style={{ marginTop: 6 }}>
          {program.days.map((day) => (
            <li key={day.id} className="row between">
              <span>{day.name}</span>
              <span className="muted small num">{day.slots.length} exercises · about {estimateMinutes(day)} min</span>
            </li>
          ))}
        </ul>
        <p className="hint">The two workouts take turns on your training days. You can edit them later in Train.</p>
      </section>
    </>
  );
}

function Setup({ onBackToWelcome }: { onBackToWelcome: () => void }) {
  const draft = useProfileDraft(EMPTY_DRAFT);
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const total = STEPS.length + 1;
  const isPlan = step === STEPS.length;

  useEffect(() => {
    window.scrollTo({ top: 0 });
    heading.current?.focus();
  }, [step]);

  const allErrors = validate(draft.d, true);
  const stepErrors = isPlan ? {} : Object.fromEntries(
    Object.entries(allErrors).filter(([k]) => STEPS[step].sections.includes(FIELD_SECTION[k as keyof ProfileDraft] as SectionId)),
  );

  function next(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.keys(stepErrors).length) return;
    setTried(false);
    setStep(step + 1);
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const v = profileValues(draft.d);
      const { targets, reasons } = initialTargets({ ...v, weightKg: v.weightKg });
      const createdAt = nowISO();
      await db.transaction('rw', db.settings, db.targets, db.programs, async () => {
        await db.targets.add({ effectiveFrom: today(), ...targets, reasons, createdAt });
        await applyProgram(v);
        await db.settings.put({
          id: 'me', sex: v.sex, age: v.age, heightCm: v.heightCm, startWeightKg: v.weightKg, activity: v.activity,
          gainRatePctPerWeek: v.gainRatePctPerWeek, experience: v.experience, setting: v.setting, trainingDays: v.trainingDays,
          sessionMinutes: v.sessionMinutes, limitations: v.limitations, avoidFoods: v.avoidFoods,
          weightUnit: v.weightUnit, lengthUnit: v.lengthUnit, likedMeals: v.likedMeals, increments: defaultIncrements(v.weightUnit), aiEnabled: false, createdAt,
        });
      });
    } catch (err) {
      setError(`Couldn't save: ${(err as Error).message || 'unknown error'}. Your answers are still here; try again.`);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="setup-progress">
        <div className="row between small">
          <span className="muted">Step {step + 1} of {total}</span>
          {step === 0 && <button className="ghost" onClick={onBackToWelcome}>Back to welcome</button>}
        </div>
        <div className="bar" aria-hidden="true"><span className="scale" style={{ transform: `scaleX(${(step + 1) / total})` }} /></div>
      </div>

      <header className="page-head">
        <h1 ref={heading} tabIndex={-1}>{isPlan ? 'Your starting plan' : STEPS[step].title}</h1>
        <p className="meta">{isPlan ? 'Here is what Rep Ledger will start you on. Everything can be changed later in Settings.' : STEPS[step].lead}</p>
      </header>

      {isPlan ? (
        <>
          <Preview d={draft.d} />
          {error && <p className="hint error-text" role="alert">{error}</p>}
          <div className="row">
            <button onClick={() => setStep(step - 1)}><Icon name="back" size="sm" />Back</button>
            <button className="primary lg grow" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Start using Rep Ledger'}</button>
          </div>
        </>
      ) : (
        <form onSubmit={next} noValidate>
          <ProfileSections draft={draft} shown={tried ? stepErrors : {}} askWeight only={STEPS[step].sections} />
          {tried && Object.keys(stepErrors).length > 0 && <p className="hint error-text" role="alert" style={{ marginBottom: 12 }}>Fix the marked answers to continue.</p>}
          <div className="row">
            {step > 0 && <button type="button" onClick={() => setStep(step - 1)}><Icon name="back" size="sm" />Back</button>}
            <button type="submit" className="primary lg grow">Continue</button>
          </div>
        </form>
      )}
    </>
  );
}

export default function Onboarding() {
  const [phase, setPhase] = useState<'welcome' | 'setup'>('welcome');
  return phase === 'welcome'
    ? <Welcome onDone={() => setPhase('setup')} offerSignIn />
    : <Setup onBackToWelcome={() => setPhase('welcome')} />;
}
