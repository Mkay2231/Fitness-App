import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, type ProgramSlot, type SetLog } from '../db';
import { nowISO, planFor, type PlanRow } from '../data';
import { Icon } from '../icons';
import { useOnline } from '../install';
import { lastDate, lastText, restText, targetText, wt } from '../plan';
import type { Suggestion } from '../rules/progression';
import { Loading, Reasons } from '../ui';
import { useUnits, type Units } from '../units';

// ---------- Small persistence helpers (unfinished input and rest timer survive a reload) ----------

const store = {
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
  },
  set(key: string, value: unknown) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

interface Draft { weight: string; reps: string; rir: number | null }

const RIR_OPTIONS = [0, 1, 2, 3, 4];

function useNow(ms: number, active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return now;
}

function useRestTimer(sessionId: number) {
  const key = `rl-rest-${sessionId}`;
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(() => store.get(key, null));
  const now = useNow(250, rest !== null);
  useEffect(() => store.set(key, rest), [key, rest]);
  useEffect(() => {
    if (rest && now >= rest.endsAt) {
      navigator.vibrate?.([200, 100, 200]);
      setRest(null);
    }
  }, [now, rest]);
  const left = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;
  return {
    left,
    total: rest?.total ?? 0,
    running: rest !== null,
    start: (sec: number) => setRest({ endsAt: Date.now() + sec * 1000, total: sec }),
    add: (sec: number) => setRest((r) => (r ? { endsAt: Math.max(Date.now(), r.endsAt + sec * 1000), total: Math.max(1, r.total + sec) } : r)),
    stop: () => setRest(null),
  };
}

type SaveState = 'saved' | 'saving' | 'error';

function useSaver() {
  const [state, setState] = useState<SaveState>('saved');
  const [message, setMessage] = useState('');
  async function run(fn: () => Promise<unknown>, failure: string): Promise<boolean> {
    setState('saving');
    try {
      await fn();
      setState('saved');
      setMessage('');
      return true;
    } catch {
      setState('error');
      setMessage(failure);
      return false;
    }
  }
  return { state, message, run };
}

// ---------- Validation ----------

// Drafts hold what you typed, in your display unit; sets are stored in kg.
function parseSet(d: Draft, bodyweight: boolean, u: Units): { weightKg: number | null; reps: number; error?: string } {
  const reps = Number(d.reps);
  const weight = d.weight.trim() === '' ? NaN : Number(d.weight.replace(',', '.'));
  if (!bodyweight && !(weight >= 0 && u.wIn(weight) <= 500)) return { weightKg: null, reps, error: `Enter the weight in ${u.wu}.` };
  if (!Number.isInteger(reps) || reps < 1 || reps > 100) return { weightKg: null, reps, error: 'Enter the reps you did (1–100).' };
  return { weightKg: bodyweight ? null : u.wIn(weight), reps };
}

const draftFrom = (s: Pick<SetLog, 'weightKg' | 'reps' | 'rir'>, u: Units): Draft => ({ weight: s.weightKg === null ? '' : String(u.wNum(s.weightKg)), reps: String(s.reps), rir: s.rir });

function defaultDraft(slot: ProgramSlot, s: Suggestion, logged: SetLog[], u: Units): Draft {
  const prev = logged.at(-1);
  if (prev) return draftFrom(prev, u);
  return { weight: s.weightKg === null ? '' : String(u.wNum(s.weightKg)), reps: String(s.targetReps), rir: slot.targetRir };
}

// ---------- Screen ----------

interface Row extends PlanRow { logged: SetLog[]; increment: number }

export default function Workout() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const online = useOnline();
  const u = useUnits();
  const timer = useRestTimer(id);
  const saver = useSaver();
  const draftKey = `rl-draft-${id}`;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => store.get(draftKey, {}));
  const [extra, setExtra] = useState<Record<string, boolean>>({});
  const [justDone, setJustDone] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  useEffect(() => store.set(draftKey, Object.keys(drafts).length ? drafts : null), [draftKey, drafts]);

  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id);
    if (!session) return { session: null };
    const settings = (await db.settings.get('me'))!;
    const program = await db.programs.get(session.programId);
    const day = program?.days.find((d) => d.id === session.dayId);
    const sets = await db.sets.where('sessionId').equals(id).sortBy('setIndex');
    const plan = day ? await planFor(day, settings, id) : [];
    const rows: Row[] = plan.map((r) => ({
      ...r,
      logged: sets.filter((s) => s.exerciseId === r.ex.id),
      increment: r.ex.equipment === 'bodyweight' ? 0 : settings.increments[r.ex.equipment],
    }));
    return { session, day, rows, total: sets.length };
  }, [id]);

  const finished = data?.session?.finishedAt != null;
  const now = useNow(1000, !!data?.session && !finished);

  if (!data) return <Loading label="Loading workout" />;
  if (!data.session) {
    return (
      <div className="page">
        <div className="panel soft"><h2>Workout not found</h2><p className="muted">It may have been discarded.</p><Link className="btn" to="/">Back to Today</Link></div>
      </div>
    );
  }
  const { session, day, rows, total } = data;
  const planned = rows.reduce((n, r) => n + r.slot.sets, 0);
  const elapsedMs = (finished ? Date.parse(session.finishedAt!) : now) - Date.parse(session.startedAt);
  const elapsed = restText(Math.max(0, Math.floor(elapsedMs / 1000)));
  const status: 'saved' | 'saving' | 'error' | 'offline' = saver.state === 'error' ? 'error' : saver.state === 'saving' ? 'saving' : !online ? 'offline' : 'saved';
  const statusText = { saved: 'Saved', saving: 'Saving…', error: 'Not saved', offline: 'Offline · saved on phone' }[status];

  async function complete(row: Row, d: Draft): Promise<string | null> {
    const parsed = parseSet(d, row.ex.equipment === 'bodyweight', u);
    if (parsed.error) return parsed.error;
    let newId = 0;
    const ok = await saver.run(async () => {
      newId = (await db.sets.add({
        sessionId: id, exerciseId: row.ex.id, date: session!.date, setIndex: row.logged.length,
        weightKg: parsed.weightKg, reps: parsed.reps, rir: d.rir, loggedAt: nowISO(),
      })) as number;
    }, `Set ${row.logged.length + 1} of ${row.ex.name} wasn't saved. Your numbers are still here; try again.`);
    if (!ok) return saver.message || 'Not saved. Try again.';
    setDrafts(({ [row.ex.id]: _, ...rest }) => rest);
    setExtra((e) => ({ ...e, [row.ex.id]: false }));
    setJustDone(newId);
    timer.start(row.slot.restSec);
    setAnnounce(`Set ${row.logged.length + 1} of ${row.ex.name} saved. Rest ${restText(row.slot.restSec)}.`);
    return null;
  }

  async function update(row: Row, set: SetLog, d: Draft): Promise<string | null> {
    const parsed = parseSet(d, row.ex.equipment === 'bodyweight', u);
    if (parsed.error) return parsed.error;
    const ok = await saver.run(() => db.sets.update(set.id!, { weightKg: parsed.weightKg, reps: parsed.reps, rir: d.rir }), 'That change wasn\'t saved. Try again.');
    if (ok) setAnnounce(`Set ${set.setIndex + 1} of ${row.ex.name} updated.`);
    return ok ? null : 'Not saved. Try again.';
  }

  async function remove(row: Row, set: SetLog) {
    await saver.run(async () => {
      await db.transaction('rw', db.sets, async () => {
        await db.sets.delete(set.id!);
        // Keep set numbers continuous after a deletion.
        const rest = row.logged.filter((s) => s.id !== set.id);
        await Promise.all(rest.map((s, i) => (s.setIndex === i ? null : db.sets.update(s.id!, { setIndex: i }))));
      });
    }, 'The set wasn\'t deleted. Try again.');
    setAnnounce(`Set ${set.setIndex + 1} of ${row.ex.name} deleted.`);
  }

  async function finish() {
    if (total === 0) {
      if (!confirm('No sets logged yet. Discard this workout?')) return;
      await db.sessions.delete(id);
      store.set(draftKey, null);
      timer.stop();
      navigate('/');
      return;
    }
    const remaining = planned - rows.reduce((n, r) => n + Math.min(r.logged.length, r.slot.sets), 0);
    if (remaining > 0 && !confirm(`${remaining} planned set${remaining === 1 ? '' : 's'} not logged. Finish anyway? Unlogged sets don't count toward progression.`)) return;
    const ok = await saver.run(() => db.sessions.update(id, { finishedAt: nowISO() }), 'The workout wasn\'t marked finished. Try again.');
    if (!ok) return;
    store.set(draftKey, null);
    timer.stop();
    navigate('/');
  }

  return (
    <div className="page wide">
      <header className="wk-header">
        <div className="wk-header-row">
          <Link to="/" className="btn ghost icon-btn" aria-label="Back to Today"><Icon name="back" /></Link>
          <div className="wk-title">
            <h1>{day?.name ?? 'Workout'}</h1>
            <div className="meta"><span aria-label={`Elapsed ${elapsed}`}>{elapsed}</span> · {total}/{planned} sets{finished ? ' · finished' : ''}</div>
          </div>
          <span className="save-status" data-state={status} role="status"><span className="dot" aria-hidden="true" />{statusText}</span>
        </div>
        <div className="wk-progress" aria-hidden="true"><span style={{ transform: `scaleX(${planned ? Math.min(1, total / planned) : 0})` }} /></div>
      </header>

      {saver.state === 'error' && (
        <div className="offline" role="alert" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Icon name="alert" size="sm" />{saver.message}</div>
      )}

      {rows.map((row) => (
        <ExerciseBlock
          key={row.ex.id}
          row={row}
          finished={finished}
          draft={drafts[row.ex.id] ?? defaultDraft(row.slot, row.suggestion, row.logged, u)}
          setDraft={(d) => setDrafts((cur) => ({ ...cur, [row.ex.id]: d }))}
          extraOpen={!!extra[row.ex.id]}
          openExtra={() => setExtra((e) => ({ ...e, [row.ex.id]: true }))}
          justDone={justDone}
          onComplete={(d) => complete(row, d)}
          onUpdate={(s, d) => update(row, s, d)}
          onDelete={(s) => remove(row, s)}
        />
      ))}

      <p className="visually-hidden" aria-live="polite">{announce}</p>

      <div className="dock">
        <div className="dock-inner">
          {finished ? (
            <div className="row between">
              <span className="muted">Finished · {total} sets · {elapsed}</span>
              <Link className="btn primary" to="/">Back to Today</Link>
            </div>
          ) : timer.running ? (
            <div className="timer" role="timer" aria-label="Rest timer">
              <div>
                <div className="t-label">Rest</div>
                <div className="t-time" aria-live="off">{restText(timer.left)}</div>
              </div>
              <div className="t-actions">
                <button onClick={() => timer.add(30)} aria-label="Add 30 seconds">+30s</button>
                <button onClick={timer.stop}>Skip</button>
              </div>
              <div className="bar" aria-hidden="true"><span className="scale" style={{ transform: `scaleX(${timer.total ? timer.left / timer.total : 0})`, transitionTimingFunction: 'linear', transitionDuration: '250ms' }} /></div>
            </div>
          ) : (
            <button className="primary lg block" onClick={finish}>{total === 0 ? 'Discard or finish' : 'Finish workout'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- One exercise ----------

function ExerciseBlock({ row, finished, draft, setDraft, extraOpen, openExtra, justDone, onComplete, onUpdate, onDelete }: {
  row: Row; finished: boolean; draft: Draft; setDraft: (d: Draft) => void;
  extraOpen: boolean; openExtra: () => void; justDone: number | null;
  onComplete: (d: Draft) => Promise<string | null>;
  onUpdate: (s: SetLog, d: Draft) => Promise<string | null>;
  onDelete: (s: SetLog) => void;
}) {
  const { slot, ex, suggestion, last, logged } = row;
  const bodyweight = ex.equipment === 'bodyweight';
  const u = useUnits();
  const unit = ex.perHand ? `${u.wu} each` : u.wu;
  const done = logged.length >= slot.sets;
  const lastWeight = last?.sets[0]?.weightKg ?? null;
  const showActive = !finished && (!done || extraOpen);
  const rowCount = Math.max(slot.sets, logged.length + (showActive && done ? 1 : 0));
  const offerLastWeight = (suggestion.kind === 'increase' || suggestion.kind === 'reduce') && lastWeight !== null && logged.length === 0 && !finished && draft.weight !== String(u.wNum(lastWeight));

  return (
    <section className={`ex${done ? ' is-complete' : ''}`} aria-labelledby={`ex-${ex.id}`}>
      <div className="ex-head">
        <div className="ex-head-row">
          <div>
            <h2 id={`ex-${ex.id}`}>{ex.name}</h2>
            <p className="ex-rx">{slot.sets} sets · {slot.repMin}–{slot.repMax} reps · rest {restText(slot.restSec)} · stop ~{slot.targetRir} reps short</p>
            {slot.note && <p className="ex-note"><Icon name="info" size="sm" />{slot.note}</p>}
          </div>
          <span className={`tag${done ? ' ok' : ''}`}>{done && <Icon name="check" size="sm" />}{logged.length}/{slot.sets}</span>
        </div>
      </div>

      <div className="ex-compare">
        <div className="target">
          <div className="l">Today's target</div>
          <div className="v">{targetText(u, suggestion)}</div>
          <div className="sub">{suggestion.kind === 'first-time' ? `${slot.repMin}–${slot.repMax} reps, ~${slot.targetRir} left in reserve` : ex.perHand ? 'per dumbbell' : ' '}</div>
        </div>
        <div>
          <div className="l">Last time</div>
          <div className="v">{lastText(u, last)}</div>
          <div className="sub">{last ? lastDate(last) : 'Log this session to start your history'}</div>
        </div>
      </div>

      <div className="ex-actions">
        <details className="ex-why" style={{ padding: '0 8px' }}>
          <summary>Why this target</summary>
          <Reasons items={suggestion.reasons} />
        </details>
        <details className="ex-why" style={{ padding: '0 8px' }}>
          <summary>How to do it</summary>
          <Reasons items={ex.cues} />
        </details>
        {offerLastWeight && (
          <button className="ghost" onClick={() => setDraft({ ...draft, weight: String(u.wNum(lastWeight)) })}>Use {wt(u, lastWeight)} {u.wu} instead</button>
        )}
      </div>

      <div className="sets" role="table" aria-label={`${ex.name} sets`}>
        <div className="sets-head" role="row">
          <span role="columnheader" style={{ textAlign: 'center' }}>Set</span>
          <span role="columnheader">Previous</span>
          <span role="columnheader">{bodyweight ? 'Load' : unit}</span>
          <span role="columnheader">Reps</span>
          <span role="columnheader"><span className="visually-hidden">Done</span></span>
        </div>
        {Array.from({ length: rowCount }, (_, i) => {
          const set = logged[i];
          const prev = last?.sets[i];
          const prevText = prev ? `${wt(u, prev.weightKg)} × ${prev.reps}` : '—';
          if (set) return <DoneSet key={set.id} index={i} set={set} prevText={prevText} bodyweight={bodyweight} unit={unit} perHand={!!ex.perHand} justDone={justDone === set.id} onUpdate={onUpdate} onDelete={onDelete} />;
          if (i === logged.length && showActive) {
            return <ActiveSet key={`active-${i}`} index={i} prevText={prevText} bodyweight={bodyweight} unit={unit} exName={ex.name} draft={draft} setDraft={setDraft} onComplete={onComplete} />;
          }
          return (
            <div key={`up-${i}`} className="set is-upcoming" role="row">
              <span className="set-no" role="cell">{i + 1}</span>
              <span className="set-prev" role="cell">{prevText}</span>
              <span className="set-value" role="cell">{finished ? '–' : bodyweight ? 'BW' : draft.weight || '–'}</span>
              <span className="set-value" role="cell">{finished ? '–' : draft.reps || suggestion.targetReps}</span>
              <span role="cell" />
            </div>
          );
        })}
        {!finished && done && !extraOpen && (
          <button className="ghost add-set" onClick={openExtra}><Icon name="plus" size="sm" />Add a set</button>
        )}
      </div>
    </section>
  );
}

function RirPicker({ value, onChange, idPrefix }: { value: number | null; onChange: (v: number) => void; idPrefix: string }) {
  return (
    <>
      <span className="rir-label" id={`${idPrefix}-rir`}>Reps left in reserve: how many more could you have done?</span>
      <div className="rir" role="group" aria-labelledby={`${idPrefix}-rir`}>
        {RIR_OPTIONS.map((v) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{v === 4 ? '4+' : v}</button>
        ))}
      </div>
    </>
  );
}

function ActiveSet({ index, prevText, bodyweight, unit, exName, draft, setDraft, onComplete }: {
  index: number; prevText: string; bodyweight: boolean; unit: string; exName: string;
  draft: Draft; setDraft: (d: Draft) => void; onComplete: (d: Draft) => Promise<string | null>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const idp = `${exName.replace(/\W+/g, '-')}-${index}`;
  const ready = draft.reps.trim() !== '' && (bodyweight || draft.weight.trim() !== '');

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    const err = await onComplete(draft);
    setBusy(false);
    setError(err ?? '');
  }

  return (
    <form className="set is-active" role="row" onSubmit={submit} noValidate>
      <span className="set-no" role="cell">{index + 1}</span>
      <span className="set-prev" role="cell">{prevText}</span>
      <span role="cell">
        {bodyweight ? <span className="set-value">BW</span> : (
          <input
            className="num-input" inputMode="decimal" enterKeyHint="next" autoComplete="off"
            aria-label={`Set ${index + 1} weight, ${unit}`} aria-invalid={error.startsWith('Enter the weight')}
            value={draft.weight} placeholder="kg"
            onChange={(e) => setDraft({ ...draft, weight: e.target.value.replace(/[^\d.,]/g, '') })}
          />
        )}
      </span>
      <span role="cell">
        <input
          className="num-input" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" autoComplete="off"
          aria-label={`Set ${index + 1} reps`} aria-invalid={error.startsWith('Enter the reps')}
          value={draft.reps} placeholder="reps"
          onChange={(e) => setDraft({ ...draft, reps: e.target.value.replace(/\D/g, '') })}
        />
      </span>
      <span role="cell">
        <button type="submit" className={`check-btn${ready ? ' ready' : ''}`} aria-label={`Log set ${index + 1}`} disabled={busy}><Icon name="check" /></button>
      </span>
      <div className="set-tools"><RirPicker idPrefix={idp} value={draft.rir} onChange={(v) => setDraft({ ...draft, rir: v })} /></div>
      {error && <p className="set-error" role="alert">{error}</p>}
    </form>
  );
}

function DoneSet({ index, set, prevText, bodyweight, unit, perHand, justDone, onUpdate, onDelete }: {
  index: number; set: SetLog; prevText: string; bodyweight: boolean; unit: string; perHand: boolean; justDone: boolean;
  onUpdate: (s: SetLog, d: Draft) => Promise<string | null>; onDelete: (s: SetLog) => void;
}) {
  const u = useUnits();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const firstInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) firstInput.current?.focus(); }, [editing !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (editing) {
    return (
      <form className="set is-active" role="row" noValidate onSubmit={async (e) => {
        e.preventDefault();
        const err = await onUpdate(set, editing);
        if (err) setError(err); else { setEditing(null); setError(''); }
      }}>
        <span className="set-no" role="cell">{index + 1}</span>
        <span className="set-prev" role="cell">{prevText}</span>
        <span role="cell">
          {bodyweight ? <span className="set-value">BW</span> : (
            <input ref={firstInput} className="num-input" inputMode="decimal" aria-label={`Set ${index + 1} weight, ${unit}`} value={editing.weight}
              onChange={(e) => setEditing({ ...editing, weight: e.target.value.replace(/[^\d.,]/g, '') })} />
          )}
        </span>
        <span role="cell">
          <input ref={bodyweight ? firstInput : undefined} className="num-input" inputMode="numeric" pattern="[0-9]*" aria-label={`Set ${index + 1} reps`} value={editing.reps}
            onChange={(e) => setEditing({ ...editing, reps: e.target.value.replace(/\D/g, '') })} />
        </span>
        <span role="cell"><button type="submit" className="check-btn ready" aria-label={`Save changes to set ${index + 1}`}><Icon name="check" /></button></span>
        <div className="set-tools">
          <RirPicker idPrefix={`edit-${set.id}`} value={editing.rir} onChange={(v) => setEditing({ ...editing, rir: v })} />
          <div className="edit-actions">
            <button type="button" className="ghost danger" onClick={() => onDelete(set)}><Icon name="trash" size="sm" />Delete set</button>
            <button type="button" onClick={() => { setEditing(null); setError(''); }}>Cancel</button>
          </div>
        </div>
        {error && <p className="set-error" role="alert">{error}</p>}
      </form>
    );
  }

  return (
    <div className={`set is-done${justDone ? ' just-done' : ''}`} role="row">
      <span className="set-no" role="cell">{index + 1}</span>
      <span className="set-prev" role="cell">{prevText}</span>
      <span className="set-value" role="cell">{wt(u, set.weightKg)}{perHand && <small>each</small>}</span>
      <span className="set-value" role="cell">{set.reps}<small>RIR {set.rir === 4 ? '4+' : set.rir ?? '–'}</small></span>
      <span role="cell">
        <button className="check-btn" aria-label={`Edit set ${index + 1}: ${set.weightKg === null ? 'bodyweight' : wt(u, set.weightKg)} by ${set.reps}`} onClick={() => setEditing(draftFrom(set, u))}>
          <Icon name="check" />
        </button>
      </span>
    </div>
  );
}
