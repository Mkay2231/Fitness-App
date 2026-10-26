import { db } from '../db';
import { applyProgram, estimateMinutes, nowISO, programForProfile, today } from '../data';
import { Icon } from '../icons';
import { initialTargets } from '../rules/nutrition';
import { defaultIncrements } from '../rules/units';
import { Reasons } from '../ui';
import ProfileForm, { EMPTY_DRAFT, profileValues, type ProfileDraft } from './ProfileForm';

export { ACTIVITY_OPTIONS, WEEKDAYS } from './ProfileForm';

function Preview({ d }: { d: ProfileDraft }) {
  const v = profileValues(d);
  const { targets, reasons } = initialTargets({ ...v, weightKg: v.weightKg });
  const program = programForProfile(v);
  return (
    <section className="panel" aria-labelledby="preview-h" aria-live="polite">
      <h2 id="preview-h">Your starting plan</h2>
      <p className="hint" style={{ marginTop: 2 }}>Estimates. Your logged weight and food will refine them after 2–3 weeks.</p>
      <div className="kpis" style={{ marginTop: 12 }}>
        <div className="kpi"><div className="v">{targets.calories.toLocaleString('en-NG')}</div><div className="l">kcal a day</div></div>
        <div className="kpi"><div className="v">{targets.proteinG} g</div><div className="l">protein a day</div></div>
      </div>
      <ul className="rows" style={{ marginTop: 8 }}>
        {program.days.map((day) => (
          <li key={day.id} className="row between">
            <span>{day.name}</span>
            <span className="muted small num">{day.slots.length} exercises · ~{estimateMinutes(day)} min</span>
          </li>
        ))}
      </ul>
      <details><summary>How the targets were calculated</summary><Reasons items={reasons} /></details>
    </section>
  );
}

export default function Onboarding() {
  async function save(d: ProfileDraft) {
    const v = profileValues(d);
    const { targets, reasons } = initialTargets({ ...v, weightKg: v.weightKg });
    const createdAt = nowISO();
    await db.transaction('rw', db.settings, db.targets, db.programs, async () => {
      await db.targets.add({ effectiveFrom: today(), ...targets, reasons, createdAt });
      await applyProgram(v);
      await db.settings.put({
        id: 'me', sex: v.sex, age: v.age, heightCm: v.heightCm, startWeightKg: v.weightKg, activity: v.activity,
        gainRatePctPerWeek: v.gainRatePctPerWeek, experience: v.experience, setting: v.setting, trainingDays: v.trainingDays,
        sessionMinutes: v.sessionMinutes, limitations: v.limitations, avoidFoods: v.avoidFoods,
        weightUnit: v.weightUnit, lengthUnit: v.lengthUnit, increments: defaultIncrements(v.weightUnit), aiEnabled: false, createdAt,
      });
    });
  }

  return (
    <>
      <header className="page-head">
        <div className="row" style={{ gap: 10, marginBottom: 16, fontWeight: 680 }}>
          <span className="brand-mark" style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="train" size="sm" /></span>
          Rep Ledger
        </div>
        <h1>Set up</h1>
        <p className="meta">A few questions to build your program and starting targets. Each one says what it's for, and you can change any answer later in Settings.</p>
      </header>
      <ProfileForm
        initial={EMPTY_DRAFT}
        askWeight
        submitLabel="Save and start"
        onSubmit={save}
        aside={(d, valid) => (valid ? <Preview d={d} /> : <p className="muted small" style={{ marginBottom: 16 }}>Your starting targets and program appear here once the answers above are complete.</p>)}
      />
    </>
  );
}
