import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db, type EquipmentKind, type Settings } from '../db';
import { applyProgram, deleteAllData, exportAll, exportCsv, importAll, nowISO, previewProgramChange, today, type CsvKind } from '../data';
import { Icon } from '../icons';
import { isIOS, isStandalone, useInstall } from '../install';
import { initialTargets, type MacroTargets } from '../rules/nutrition';
import { defaultIncrements, fromWeight, tidy, toWeight } from '../rules/units';
import { Loading, Reasons } from '../ui';
import { useUnits } from '../units';
import ProfileForm, { draftFromSettings, profileValues, type ProfileDraft } from './ProfileForm';

const EQUIP: { id: EquipmentKind; label: string; hint: string }[] = [
  { id: 'dumbbell', label: 'Dumbbells', hint: 'Jump between dumbbell pairs, per hand' },
  { id: 'barbell', label: 'Barbell', hint: 'Total jump (two small plates)' },
  { id: 'machine', label: 'Machines', hint: 'One pin position on the stack' },
  { id: 'cable', label: 'Cables', hint: 'One pin position on the stack' },
];

const CSV_EXPORTS: [CsvKind, string][] = [['sets', 'Workout sets'], ['weights', 'Weigh-ins'], ['measurements', 'Measurements'], ['food', 'Food log'], ['checkins', 'Check-ins']];

const PROGRAM_KEYS = ['setting', 'experience', 'sessionMinutes', 'limitations'] as const;
const TARGET_KEYS = ['sex', 'age', 'heightCm', 'activity', 'gainRatePctPerWeek'] as const;

interface Pending {
  programChanges: string[];
  targets: { next: MacroTargets; reasons: string[]; weightKg: number } | null;
}

export default function SettingsScreen() {
  const settings = useLiveQuery(() => db.settings.get('me'));
  const persisted = useLiveQuery(async () => (await navigator.storage?.persisted?.()) ?? false);
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [formKey, setFormKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  if (!settings) return <Loading label="Loading settings" />;

  async function saveProfile(d: ProfileDraft) {
    const s = settings!;
    const v = profileValues(d);
    const patch: Partial<Settings> = {
      sex: v.sex, age: v.age, heightCm: v.heightCm, activity: v.activity, gainRatePctPerWeek: v.gainRatePctPerWeek,
      experience: v.experience, setting: v.setting, trainingDays: v.trainingDays, sessionMinutes: v.sessionMinutes,
      limitations: v.limitations, avoidFoods: v.avoidFoods, weightUnit: v.weightUnit, lengthUnit: v.lengthUnit,
    };
    // Keep weight jumps sensible when switching kg ↔ lb, unless you'd customised them.
    if (v.weightUnit !== s.weightUnit && JSON.stringify(s.increments) === JSON.stringify(defaultIncrements(s.weightUnit))) {
      patch.increments = defaultIncrements(v.weightUnit);
    }
    await db.settings.update('me', patch);

    const programChanged = PROGRAM_KEYS.some((k) => JSON.stringify(s[k]) !== JSON.stringify(v[k]));
    const targetsChanged = TARGET_KEYS.some((k) => s[k] !== v[k]);
    const programChanges = programChanged ? (await previewProgramChange(v)).changes : [];
    let targets: Pending['targets'] = null;
    if (targetsChanged) {
      const weightKg = (await db.weights.orderBy('date').last())?.kg ?? s.startWeightKg;
      const t = initialTargets({ ...v, weightKg });
      targets = { next: t.targets, reasons: t.reasons, weightKg };
    }
    setPending(programChanges.length || targets ? { programChanges, targets } : null);
    setMsg('Profile saved.');
  }

  async function acceptProgram() {
    await applyProgram(settings!);
    setPending((p) => (p && p.targets ? { ...p, programChanges: [] } : null));
    setMsg('Programme updated. Your logged workouts are unchanged.');
  }

  async function acceptTargets() {
    const t = pending!.targets!;
    await db.targets.add({ effectiveFrom: today(), ...t.next, reasons: ['Recalculated after a profile change', ...t.reasons], createdAt: nowISO() });
    setPending((p) => (p && p.programChanges.length ? { ...p, targets: null } : null));
    setMsg('Targets updated.');
  }

  async function download() {
    const blob = new Blob([await exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rep-ledger-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function downloadCsv(kind: CsvKind) {
    const blob = new Blob([await exportCsv(kind)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rep-ledger-${kind}-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restore(file: File) {
    if (!confirm('Restoring replaces ALL data on this device with the backup. Continue?')) return;
    try {
      await importAll(await file.text());
      setFormKey((k) => k + 1);
      setMsg('Backup restored.');
    } catch (e) {
      setMsg(`Restore failed: ${(e as Error).message} Nothing was changed.`);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
        <p className="meta">Your profile, weight jumps and data.</p>
      </header>

      {msg && <div className="notice" role="status"><Icon name="check" size="sm" />{msg}</div>}

      {pending && (
        <section className="panel review-changes" aria-labelledby="pending-h">
          <h2 id="pending-h">Review changes</h2>
          <p className="hint" style={{ marginTop: 2 }}>Your profile is saved. These follow from it, and nothing changes until you accept.</p>
          {pending.programChanges.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h3>Programme</h3>
              <Reasons items={pending.programChanges} />
              <div className="row wrap" style={{ marginTop: 10 }}>
                <button className="primary" onClick={acceptProgram}>Update programme</button>
                <button onClick={() => setPending((p) => (p && p.targets ? { ...p, programChanges: [] } : null))}>Keep current programme</button>
              </div>
            </div>
          )}
          {pending.targets && (
            <div style={{ marginTop: 16 }}>
              <h3>Daily targets</h3>
              <p className="small">New estimate: <strong className="num">{pending.targets.next.calories.toLocaleString('en-NG')} kcal</strong>, <strong className="num">{pending.targets.next.proteinG} g protein</strong>.</p>
              <details><summary>How it was calculated</summary><Reasons items={pending.targets.reasons} /></details>
              <div className="row wrap" style={{ marginTop: 6 }}>
                <button className="primary" onClick={acceptTargets}>Use new targets</button>
                <button onClick={() => setPending((p) => (p && p.programChanges.length ? { ...p, targets: null } : null))}>Keep current targets</button>
              </div>
            </div>
          )}
        </section>
      )}

      <InstallCard />

      <section className="section" aria-labelledby="profile-h">
        <h2 id="profile-h">Profile</h2>
        <ProfileForm key={`${formKey}-${settings.weightUnit}-${settings.lengthUnit}`} initial={draftFromSettings(settings)} askWeight={false} submitLabel="Save profile" onSubmit={saveProfile} />
      </section>

      <Increments settings={settings} />

      <section className="panel" aria-labelledby="data-h">
        <h2 id="data-h">Your data</h2>
        <p className="small" style={{ marginTop: 6 }}>Everything is stored only in this browser on this device. Nothing is sent to a server. {persisted ? 'The browser has agreed to keep it.' : 'The browser may clear it if storage runs low, so export a backup regularly.'}</p>
        <div className="stack">
          <button className="block" onClick={download}>Export full backup (JSON)</button>
          <button className="block" onClick={() => fileInput.current?.click()}>Restore from a backup…</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden tabIndex={-1} aria-hidden="true"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f); }} />
        </div>
        <details style={{ marginTop: 8 }}>
          <summary>Export for a spreadsheet (CSV)</summary>
          <p className="hint" style={{ marginTop: 0 }}>Weights in kg and lengths in cm. CSV files can't be restored; use the JSON backup for that.</p>
          <div className="stack">
            {CSV_EXPORTS.map(([kind, label]) => <button key={kind} className="block" onClick={() => downloadCsv(kind)}>{label}</button>)}
          </div>
        </details>
        <details style={{ marginTop: 4 }}>
          <summary className="danger-summary">Delete all data</summary>
          <p className="small">Removes your profile, workouts, food log, weights, measurements, check-ins and decisions from this device, including unfinished workouts. It can't be undone, so export a backup first.</p>
          <button className="block danger" onClick={async () => {
            if (!confirm('Delete ALL your data on this device? This cannot be undone.')) return;
            await deleteAllData();
            location.reload();
          }}>Delete everything on this device</button>
        </details>
      </section>

      <TargetHistory />
    </div>
  );
}

function Increments({ settings }: { settings: Settings }) {
  const u = useUnits();
  const [error, setError] = useState('');
  return (
    <section className="panel" aria-labelledby="inc-h">
      <h2 id="inc-h">Smallest weight jumps</h2>
      <p className="hint" style={{ marginTop: 2, marginBottom: 12 }}>Check these at your gym. When every set reaches the top of its range, the weight goes up by exactly this much.</p>
      {EQUIP.map((e) => (
        <div key={`${e.id}-${u.wu}`} className="row field">
          <label htmlFor={`inc-${e.id}`} className="grow" style={{ margin: 0 }}>{e.label}<span className="hint" style={{ display: 'block', marginTop: 0 }}>{e.hint}</span></label>
          <input id={`inc-${e.id}`} inputMode="decimal" style={{ width: 96 }} defaultValue={tidy(toWeight(settings.increments[e.id], u.wu), 2)}
            onBlur={(ev) => {
              const v = +ev.target.value.replace(',', '.');
              const kg = fromWeight(v, u.wu);
              if (kg > 0 && kg <= 20) { setError(''); void db.settings.update('me', { increments: { ...settings.increments, [e.id]: kg } }); }
              else setError(`${e.label}: enter a jump between ${u.wu === 'kg' ? '0.25 and 20 kg' : '0.5 and 44 lb'}.`);
            }} />
          <span className="muted">{u.wu}</span>
        </div>
      ))}
      {error && <p className="hint error-text" role="alert">{error}</p>}
    </section>
  );
}

function InstallCard() {
  const { canPrompt, prompt } = useInstall();
  if (isStandalone()) return null;
  return (
    <section className="panel" aria-labelledby="install-h">
      <h2 id="install-h">Install on your phone</h2>
      <p className="small" style={{ marginTop: 6 }}>Installed, it opens from your home screen and works with no internet, so you can log sets at the gym.</p>
      {canPrompt ? (
        <button className="primary block" onClick={prompt}>Install app</button>
      ) : isIOS() ? (
        <p className="small">In <strong>Safari</strong>, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p>
      ) : (
        <p className="small">In <strong>Chrome</strong>, open the menu and tap <strong>Install app</strong> or <strong>Add to Home screen</strong>. This needs the published (https) version of the app.</p>
      )}
    </section>
  );
}

function TargetHistory() {
  const versions = useLiveQuery(() => db.targets.orderBy('effectiveFrom').reverse().toArray()) ?? [];
  if (versions.length === 0) return null;
  return (
    <details className="panel">
      <summary>Target history ({versions.length})</summary>
      <ul className="rows">
        {versions.map((v) => (
          <li key={v.id} className="small">
            <strong className="num">{v.effectiveFrom}</strong>: <span className="num">{v.calories} kcal · {v.proteinG} P · {v.carbsG} C · {v.fatG} F</span>
            <Reasons items={v.reasons} />
          </li>
        ))}
      </ul>
    </details>
  );
}
