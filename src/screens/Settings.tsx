import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type EquipmentKind, type Settings } from '../db';
import { activateProgram, exportAll, getActiveProgram, importAll, nowISO, today } from '../data';
import { initialTargets } from '../rules/nutrition';
import { PROGRAM_TEMPLATES } from '../seed/programs';
import { Reasons } from '../ui';
import { ACTIVITY_OPTIONS, WEEKDAYS } from './Onboarding';

const EQUIP: { id: EquipmentKind; label: string; hint: string }[] = [
  { id: 'dumbbell', label: 'Dumbbells', hint: 'Jump between dumbbell pairs, per hand' },
  { id: 'barbell', label: 'Barbell', hint: 'Total jump (two small plates)' },
  { id: 'machine', label: 'Machines', hint: 'One pin position on the stack' },
  { id: 'cable', label: 'Cables', hint: 'One pin position on the stack' },
];

export default function SettingsScreen() {
  const settings = useLiveQuery(() => db.settings.get('me'));
  const program = useLiveQuery(() => getActiveProgram());
  const persisted = useLiveQuery(async () => (await navigator.storage?.persisted?.()) ?? false);
  const [msg, setMsg] = useState('');
  if (!settings) return null;

  const update = (patch: Partial<Settings>) => db.settings.update('me', patch);

  async function recalc() {
    const latest = await db.weights.orderBy('date').last();
    const weightKg = latest?.kg ?? settings!.startWeightKg;
    const { targets, reasons } = initialTargets({ ...settings!, weightKg });
    if (!confirm(`Replace your current targets with a fresh estimate: ${targets.calories} kcal, ${targets.proteinG} g protein? (Uses ${weightKg} kg.)`)) return;
    await db.targets.add({ effectiveFrom: today(), ...targets, reasons: ['Recalculated from profile', ...reasons], createdAt: nowISO() });
    setMsg('Targets recalculated.');
  }

  async function download() {
    const blob = new Blob([await exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rep-ledger-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restore(file: File) {
    if (!confirm('Restoring replaces ALL data on this device with the backup. Continue?')) return;
    try {
      await importAll(await file.text());
      setMsg('Backup restored.');
    } catch (e) {
      setMsg(`Restore failed: ${(e as Error).message}`);
    }
  }

  return (
    <>
      <h1>More</h1>
      {msg && <div className="card soft" role="status">{msg}</div>}

      <section className="card" aria-label="Program">
        <h2>Program</h2>
        <select aria-label="Program" value={program?.id ?? ''} onChange={(e) => activateProgram(e.target.value)}>
          {PROGRAM_TEMPLATES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <p className="hint">Switching keeps all your logged history. Shared exercises keep their progression.</p>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Training days</label>
          <div className="chips" role="group" aria-label="Training days">
            {WEEKDAYS.map((d) => (
              <button key={d.value} className="chip" aria-pressed={settings.trainingDays.includes(d.value)}
                onClick={() => update({ trainingDays: settings.trainingDays.includes(d.value) ? settings.trainingDays.filter((x) => x !== d.value) : [...settings.trainingDays, d.value].sort() })}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card" aria-label="Weight increments">
        <h2>Smallest weight jumps</h2>
        <p className="muted small">Set these once you know your gym or equipment. Progression adds exactly this much.</p>
        {EQUIP.map((e) => (
          <div key={e.id} className="row field">
            <label htmlFor={`inc-${e.id}`} className="grow" style={{ margin: 0 }}>{e.label}<div className="hint">{e.hint}</div></label>
            <input id={`inc-${e.id}`} inputMode="decimal" style={{ width: 90 }} defaultValue={settings.increments[e.id]}
              onBlur={(ev) => { const v = +ev.target.value.replace(',', '.'); if (v > 0 && v <= 20) update({ increments: { ...settings.increments, [e.id]: v } }); }} />
            <span className="muted">kg</span>
          </div>
        ))}
      </section>

      <section className="card" aria-label="Profile">
        <h2>Profile and targets</h2>
        <div className="row">
          <div className="field grow"><label htmlFor="sa">Age</label><input id="sa" inputMode="numeric" defaultValue={settings.age} onBlur={(e) => +e.target.value > 0 && update({ age: +e.target.value })} /></div>
          <div className="field grow"><label htmlFor="sh">Height cm</label><input id="sh" inputMode="decimal" defaultValue={settings.heightCm} onBlur={(e) => +e.target.value > 0 && update({ heightCm: +e.target.value })} /></div>
        </div>
        <div className="field">
          <label htmlFor="sact">Activity</label>
          <select id="sact" value={settings.activity} onChange={(e) => update({ activity: e.target.value as Settings['activity'] })}>
            {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}: {o.hint}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sr">Gain rate (% body weight / week)</label>
          <select id="sr" value={settings.gainRatePctPerWeek} onChange={(e) => update({ gainRatePctPerWeek: +e.target.value })}>
            {[0.25, 0.4, 0.5].map((r) => <option key={r} value={r}>{r}%</option>)}
          </select>
        </div>
        <button className="block" onClick={recalc}>Recalculate targets from profile</button>
        <TargetHistory />
      </section>

      <section className="card" aria-label="AI explanations">
        <h2>AI explanations</h2>
        <p className="small">Not enabled yet. When turned on, Claude will explain your weekly review in plain language. It reads the numbers above and never changes your plan. It needs a small server function and an API key, and costs are confirmed with you before it's switched on.</p>
      </section>

      <section className="card" aria-label="Your data">
        <h2>Your data</h2>
        <p className="small">Everything is stored only in this browser on this device. {persisted ? 'The browser has agreed to keep it.' : 'The browser may clear it if storage runs low, so export a backup regularly.'}</p>
        <div className="stack">
          <button className="block" onClick={download}>Export backup (JSON)</button>
          <label className="btn block" style={{ fontWeight: 600 }}>
            Restore from backup
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          </label>
          <button className="block danger" onClick={async () => {
            if (!confirm('Delete ALL data on this device? Export a backup first. This cannot be undone.')) return;
            await db.delete();
            location.reload();
          }}>Delete all data</button>
        </div>
      </section>
    </>
  );
}

function TargetHistory() {
  const versions = useLiveQuery(() => db.targets.orderBy('effectiveFrom').reverse().toArray()) ?? [];
  return (
    <details>
      <summary className="small">Target history ({versions.length})</summary>
      <ul className="list">
        {versions.map((v) => (
          <li key={v.id} className="small">
            <strong>{v.effectiveFrom}</strong>: {v.calories} kcal · {v.proteinG} P · {v.carbsG} C · {v.fatG} F
            <Reasons items={v.reasons} />
          </li>
        ))}
      </ul>
    </details>
  );
}
