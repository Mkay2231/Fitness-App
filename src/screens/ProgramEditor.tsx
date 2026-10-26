import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db, type Exercise, type Program, type ProgramDay, type ProgramSlot } from '../db';
import { EXERCISE_NAMES, estimateMinutes, getActiveProgram, programForProfile } from '../data';
import { Icon } from '../icons';
import { usableAt, validateProgram } from '../rules/library';
import { programChanges } from '../rules/program';
import { Loading, Reasons } from '../ui';

const REST_OPTIONS = [60, 90, 120, 150, 180, 240];
const restLabel = (s: number) => (s < 120 ? `${s} s` : `${s / 60} min`);
const int = (v: string) => (v === '' ? 0 : Number(v.replace(/\D/g, '')));

function newSlot(exerciseId: string): ProgramSlot {
  return { exerciseId, sets: 3, repMin: 8, repMax: 12, targetRir: 2, restSec: 120 };
}

/** Grouped by main muscle so finding a replacement is quick. */
function ExerciseSelect({ id, value, library, setting, exclude, onChange, placeholder }: {
  id: string; value: string; library: Exercise[]; setting: Program['setting']; exclude: string[];
  onChange: (id: string) => void; placeholder?: string;
}) {
  const groups = new Map<string, Exercise[]>();
  for (const e of library) {
    if (e.id !== value && (exclude.includes(e.id) || !usableAt(e, setting))) continue;
    groups.set(e.primary, [...(groups.get(e.primary) ?? []), e]);
  }
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([muscle, list]) => (
        <optgroup key={muscle} label={muscle[0].toUpperCase() + muscle.slice(1)}>
          {list.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export default function ProgramEditor() {
  const navigate = useNavigate();
  const data = useLiveQuery(async () => ({
    program: await getActiveProgram(),
    library: await db.exercises.toArray(),
    settings: (await db.settings.get('me'))!,
  }));
  const [draft, setDraft] = useState<Program | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.program && !draft) setDraft(structuredClone(data.program));
  }, [data, draft]);

  if (!data) return <Loading label="Loading programme" />;
  if (!data.program || !draft) {
    return <div className="page"><div className="panel soft"><h2>No programme yet</h2><Link className="btn" to="/settings">Set up your profile</Link></div></div>;
  }
  const { program: saved, library, settings } = data;
  const savedIds = new Map(saved.days.map((d) => [d.id, new Set(d.slots.map((s) => s.exerciseId))]));

  const setDay = (di: number, fn: (d: ProgramDay) => ProgramDay) => setDraft((p) => p && { ...p, days: p.days.map((d, i) => (i === di ? fn(d) : d)) });
  const setSlot = (di: number, si: number, patch: Partial<ProgramSlot>) =>
    setDay(di, (d) => ({ ...d, slots: d.slots.map((s, i) => (i === si ? { ...s, ...patch } : s)) }));
  const moveSlot = (di: number, si: number, by: number) =>
    setDay(di, (d) => {
      const slots = [...d.slots];
      const [s] = slots.splice(si, 1);
      slots.splice(si + by, 0, s);
      return { ...d, slots };
    });

  function addDay() {
    setDraft((p) => {
      if (!p) return p;
      const used = new Set(p.days.map((d) => d.id));
      const id = 'ABCDEFG'.split('').find((c) => !used.has(c)) ?? `D${p.days.length + 1}`;
      return { ...p, days: [...p.days, { id, name: `Session ${id}`, slots: [] }] };
    });
  }

  function loadRecommended() {
    const rec = programForProfile(settings);
    const changes = programChanges(draft!, rec, EXERCISE_NAMES);
    if (changes.length === 0) { setNotice('This already matches the recommended programme for your profile.'); return; }
    if (!confirm(`Replace the programme below with the recommended one for your profile?\n\n${changes.slice(0, 8).join('\n')}${changes.length > 8 ? `\n…and ${changes.length - 8} more` : ''}\n\nNothing is saved until you press Save.`)) return;
    setDraft({ ...structuredClone(rec), active: true, createdAt: saved.createdAt });
    setNotice('Loaded the recommended programme. Review it, then save.');
  }

  async function save() {
    const errs = validateProgram(draft!, library);
    setErrors(errs);
    if (errs.length) { window.scrollTo({ top: 0 }); return; }
    setSaving(true);
    try {
      await db.programs.put({ ...draft!, name: draft!.name.trim() || saved.name, customised: true, active: true });
      navigate('/train');
    } catch (e) {
      setErrors([`Couldn't save: ${(e as Error).message}. Your edits are still here; try again.`]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Edit programme</h1>
          <p className="meta">Changes apply to future workouts. Workouts you've logged never change.</p>
        </div>
        <Link to="/train" className="btn ghost">Cancel</Link>
      </header>

      {errors.length > 0 && (
        <div className="panel" role="alert" style={{ borderColor: 'var(--danger)' }}>
          <h2 style={{ color: 'var(--danger)' }}>Fix these to save</h2>
          <Reasons items={errors} />
        </div>
      )}
      {notice && <div className="notice" role="status"><Icon name="info" size="sm" />{notice}</div>}

      <section className="panel">
        <div className="field">
          <label htmlFor="prog-name">Programme name</label>
          <input id="prog-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <p className="hint" style={{ marginTop: 0 }}>Keep the same exercises week to week so you can see progress. Swapping an exercise starts its own history; the old one is kept.</p>
        <button className="ghost" style={{ marginLeft: -12 }} onClick={loadRecommended}>Start from the recommended programme for your profile</button>
      </section>

      {draft.days.map((day, di) => {
        const inDay = day.slots.map((s) => s.exerciseId);
        return (
          <section key={day.id} className="panel" aria-labelledby={`day-${day.id}`}>
            <div className="panel-head">
              <h2 id={`day-${day.id}`}>{day.name || `Day ${di + 1}`}</h2>
              <span className="muted small num">{day.slots.length ? `~${estimateMinutes(day)} min` : 'empty'}</span>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor={`day-name-${day.id}`}>Session name</label>
              <input id={`day-name-${day.id}`} value={day.name} onChange={(e) => setDay(di, (d) => ({ ...d, name: e.target.value }))} />
            </div>

            <ol className="slot-list">
              {day.slots.map((slot, si) => {
                const key = `${day.id}-${si}`;
                const isNew = !savedIds.get(day.id)?.has(slot.exerciseId);
                return (
                  <li key={key} className="slot-edit">
                    <div className="slot-top">
                      <span className="set-no">{si + 1}</span>
                      <div className="grow">
                        <label htmlFor={`ex-${key}`} className="visually-hidden">Exercise {si + 1}</label>
                        <ExerciseSelect id={`ex-${key}`} value={slot.exerciseId} library={library} setting={draft.setting} exclude={inDay} onChange={(id) => setSlot(di, si, { exerciseId: id, note: undefined })} />
                      </div>

                    </div>
                    <div className="slot-fields">
                      <div><label htmlFor={`sets-${key}`}>Sets</label><input id={`sets-${key}`} inputMode="numeric" value={slot.sets || ''} onChange={(e) => setSlot(di, si, { sets: int(e.target.value) })} /></div>
                      <div><label htmlFor={`min-${key}`}>Reps from</label><input id={`min-${key}`} inputMode="numeric" value={slot.repMin || ''} onChange={(e) => setSlot(di, si, { repMin: int(e.target.value) })} /></div>
                      <div><label htmlFor={`max-${key}`}>to</label><input id={`max-${key}`} inputMode="numeric" value={slot.repMax || ''} onChange={(e) => setSlot(di, si, { repMax: int(e.target.value) })} /></div>
                      <div><label htmlFor={`rest-${key}`}>Rest</label>
                        <select id={`rest-${key}`} value={slot.restSec} onChange={(e) => setSlot(di, si, { restSec: +e.target.value })}>
                          {[...new Set([...REST_OPTIONS, slot.restSec])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{restLabel(r)}</option>)}
                        </select>
                      </div>
                      <div><label htmlFor={`rir-${key}`}>Stop short by</label>
                        <select id={`rir-${key}`} value={slot.targetRir} onChange={(e) => setSlot(di, si, { targetRir: +e.target.value })}>
                          {[0, 1, 2, 3, 4].map((r) => <option key={r} value={r}>{r} rep{r === 1 ? '' : 's'}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="slot-actions">
                      <button className="ghost icon-btn" aria-label={`Move ${EXERCISE_NAMES[slot.exerciseId]} up`} disabled={si === 0} onClick={() => moveSlot(di, si, -1)}><Icon name="up" size="sm" /></button>
                      <button className="ghost icon-btn" aria-label={`Move ${EXERCISE_NAMES[slot.exerciseId]} down`} disabled={si === day.slots.length - 1} onClick={() => moveSlot(di, si, 1)}><Icon name="down" size="sm" /></button>
                      <button className="ghost danger icon-btn" aria-label={`Remove ${EXERCISE_NAMES[slot.exerciseId]}`} onClick={() => setDay(di, (d) => ({ ...d, slots: d.slots.filter((_, i) => i !== si) }))}><Icon name="trash" size="sm" /></button>
                    </div>
                    {isNew && <p className="ex-note"><Icon name="info" size="sm" />New in this session. Its history starts with your next workout.</p>}
                  </li>
                );
              })}
            </ol>

            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor={`add-${day.id}`}>Add an exercise</label>
              <ExerciseSelect id={`add-${day.id}`} value="" library={library} setting={draft.setting} exclude={inDay} placeholder="Choose an exercise…"
                onChange={(id) => id && setDay(di, (d) => ({ ...d, slots: [...d.slots, newSlot(id)] }))} />
            </div>
            {draft.days.length > 1 && (
              <button className="ghost danger" style={{ marginLeft: -12 }} onClick={() => confirm(`Remove ${day.name || `Day ${di + 1}`} from the programme?`) && setDraft({ ...draft, days: draft.days.filter((_, i) => i !== di) })}>
                <Icon name="trash" size="sm" />Remove this session
              </button>
            )}
          </section>
        );
      })}

      {draft.days.length < 7 && <button className="block" onClick={addDay} style={{ marginBottom: 16 }}><Icon name="plus" size="sm" />Add a session</button>}
      <p className="hint">Sessions rotate in order on your training days ({draft.days.map((d) => d.name || d.id).join(' → ')}).</p>
      <button className="primary lg block" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save programme'}</button>
    </div>
  );
}
