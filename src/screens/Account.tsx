import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { lastSyncedAt, useAccount, type SyncStatus } from '../account';
import { authMessage, redirectTo, supabase } from '../cloud';
import { db } from '../db';
import { Icon } from '../icons';
import { Loading } from '../ui';
import type { CopySummary } from '../sync';

const MIN_PASSWORD = 8;

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** One line saying where your data stands, used here, in Settings and in the app banner. */
export function syncText(status: SyncStatus, at: string | null): string {
  switch (status.kind) {
    case 'off': return 'Accounts aren’t set up in this version of the app.';
    case 'idle': return 'Not synced yet.';
    case 'syncing': return 'Syncing…';
    case 'offline': return 'Offline. Changes stay on this phone and sync when you’re back online.';
    case 'error': return `Sync didn’t finish. ${status.message} Your data is safe on this phone.`;
    case 'empty': return 'Your account has no data yet. Finish setting up and it will be copied there.';
    case 'conflict': return 'Sync is paused until you choose which copy to keep.';
    case 'synced': return at ? `Synced ${when(at)}.` : 'Synced.';
  }
}

export default function Account() {
  const a = useAccount();
  const hasProfile = useLiveQuery(async () => !!(await db.settings.get('me')));
  if (hasProfile === undefined || a.session === undefined) return <Loading label="Checking your account" />;
  return (
    <div className="page">
      <header className="page-head">
        {!hasProfile && <Link to="/" className="btn ghost" style={{ marginLeft: -12 }}><Icon name="back" size="sm" />Back to setup</Link>}
        <h1>Account</h1>
        <p className="meta">An account keeps a copy of your data, so it survives a lost phone and you can use it on another device. The app works offline either way.</p>
      </header>
      {!a.enabled ? <NotSetUp /> : a.session && a.recovering ? <NewPassword /> : a.session ? <SignedIn hasProfile={hasProfile} /> : <SignIn />}
      <Privacy />
    </div>
  );
}

function NotSetUp() {
  return (
    <section className="panel">
      <h2>Accounts aren’t switched on</h2>
      <p className="small" style={{ marginTop: 6 }}>This copy of the app has no account service connected, so your data stays on this phone only. Use <Link to="/settings">Settings → Export full backup</Link> to keep a copy.</p>
    </section>
  );
}

type Mode = 'signin' | 'signup' | 'reset';

function SignIn() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const auth = supabase!.auth;

  const switchTo = (m: Mode) => { setMode(m); setError(''); setMsg(''); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setMsg('');
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError('Enter your email address, like name@example.com.'); return; }
    if (mode !== 'reset' && password.length < (mode === 'signup' ? MIN_PASSWORD : 1)) {
      setError(mode === 'signup' ? `Use at least ${MIN_PASSWORD} characters for your password.` : 'Enter your password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await auth.signInWithPassword({ email: address, password });
        if (err) setError(authMessage(err));
      } else if (mode === 'signup') {
        const { data, error: err } = await auth.signUp({ email: address, password, options: { emailRedirectTo: redirectTo() } });
        if (err) setError(authMessage(err));
        else if (!data.session) {
          setMsg(`Check ${address} for a link to confirm your account, then sign in here. If you already have an account, sign in instead.`);
          setMode('signin');
        }
      } else {
        const { error: err } = await auth.resetPasswordForEmail(address, { redirectTo: redirectTo() });
        if (err) setError(authMessage(err));
        else setMsg(`If there’s an account for ${address}, a link to choose a new password is on its way. Open it on this phone.`);
      }
    } catch (err) {
      setError(authMessage(err as Error));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError('');
    const { error: err } = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
    if (err) setError(authMessage(err));
  }

  return (
    <section className="panel" aria-labelledby="signin-h">
      <h2 id="signin-h" className="visually-hidden">{mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'Sign in'}</h2>
      {mode !== 'reset' && (
        <div className="segmented" role="tablist" aria-label="Account">
          <button role="tab" aria-selected={mode === 'signin'} onClick={() => switchTo('signin')}>Sign in</button>
          <button role="tab" aria-selected={mode === 'signup'} onClick={() => switchTo('signup')}>New account</button>
        </div>
      )}
      {msg && <div className="notice" role="status"><Icon name="check" size="sm" />{msg}</div>}

      {mode !== 'reset' && (
        <>
          <button className="block" onClick={google} disabled={busy}>Continue with Google</button>
          <p className="divider-text" aria-hidden="true">or with email</p>
        </>
      )}

      <form onSubmit={submit} noValidate>
        {mode === 'reset' && <p className="small" style={{ marginTop: 0 }}>Enter the email you signed up with. We’ll send a link to choose a new password.</p>}
        <div className="field">
          <label htmlFor="acc-email">Email</label>
          <input id="acc-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error && !email.trim()} />
        </div>
        {mode !== 'reset' && (
          <div className="field">
            <label htmlFor="acc-password">Password</label>
            <input id="acc-password" type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={mode === 'signup' ? 'acc-password-hint' : undefined} />
            {mode === 'signup' && <p className="hint" id="acc-password-hint">At least {MIN_PASSWORD} characters. Not one you use anywhere else.</p>}
            <label className="check-row"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />Show password</label>
          </div>
        )}
        {error && <p className="hint error-text" role="alert" style={{ marginBottom: 12 }}>{error}</p>}
        <button type="submit" className="primary block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
        </button>
      </form>
      <div className="row wrap" style={{ marginTop: 8 }}>
        {mode === 'reset'
          ? <button className="ghost" style={{ marginLeft: -12 }} onClick={() => switchTo('signin')}>Back to sign in</button>
          : mode === 'signin' && <button className="ghost" style={{ marginLeft: -12 }} onClick={() => switchTo('reset')}>Forgot password?</button>}
      </div>
    </section>
  );
}

function NewPassword() {
  const a = useAccount();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) { setError(`Use at least ${MIN_PASSWORD} characters.`); return; }
    setBusy(true);
    const { error: err } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(authMessage(err)); else a.doneRecovering();
  }
  return (
    <section className="panel" aria-labelledby="newpw-h">
      <h2 id="newpw-h">Choose a new password</h2>
      <form onSubmit={save} noValidate style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="acc-new-password">New password</label>
          <input id="acc-new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="hint">At least {MIN_PASSWORD} characters.</p>
        </div>
        {error && <p className="hint error-text" role="alert" style={{ marginBottom: 12 }}>{error}</p>}
        <button type="submit" className="primary block" disabled={busy}>Save new password</button>
      </form>
    </section>
  );
}

function SignedIn({ hasProfile }: { hasProfile: boolean }) {
  const a = useAccount();
  const [error, setError] = useState('');
  const user = a.session!.user;
  const status = a.status;
  const provider = user.app_metadata?.provider === 'google' ? 'Google' : 'email and password';

  async function run(action: () => Promise<void>) {
    setError('');
    try { await action(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <section className="panel" aria-labelledby="who-h">
        <div className="row">
          <Icon name="user" />
          <div className="grow">
            <h2 id="who-h" style={{ overflowWrap: 'anywhere' }}>{user.email}</h2>
            <p className="hint" style={{ marginTop: 0 }}>Signed in with {provider}.</p>
          </div>
        </div>
        <SyncLine />
        {status.kind === 'empty' && !hasProfile && <Link to="/" className="btn primary block" style={{ marginTop: 12 }}>Set up my plan</Link>}
        {status.kind !== 'conflict' && (
          <button className="block" style={{ marginTop: 12 }} onClick={() => void a.syncNow()} disabled={status.kind === 'syncing'}>Sync now</button>
        )}
      </section>

      {status.kind === 'conflict' && <Conflict local={status.local} cloud={status.cloud} reason={status.decision.reason} />}

      <details className="panel">
        <summary>What’s in your account copy</summary>
        <p className="small">Your profile, programme, workouts and sets, food log and meal-plan swaps, your own foods and portions, weigh-ins, measurements, check-ins, targets and review decisions.</p>
        <p className="small">Not included: a set you’ve typed but not saved, dismissed guides, and shopping-list ticks. These stay on each phone.</p>
      </details>

      <section className="panel" aria-labelledby="signout-h">
        <h2 id="signout-h">Sign out</h2>
        <p className="small" style={{ marginTop: 6 }}>Your data stays on this phone and in your account. Sign in again any time to carry on syncing.</p>
        <button className="block" onClick={() => void run(() => a.signOut())}>Sign out</button>
        <details style={{ marginTop: 8 }}>
          <summary>Sign out and remove data from this phone</summary>
          <p className="small">For a shared or old phone. It syncs first, and only removes this phone’s data if everything is safely in your account.</p>
          <button className="block danger" onClick={() => {
            if (!confirm('Sign out and remove all Rep Ledger data from this phone? Your account copy is kept.')) return;
            void run(() => a.signOut(true));
          }}>Sign out and remove from this phone</button>
        </details>
        {error && <p className="hint error-text" role="alert">{error}</p>}
      </section>

      <details className="panel">
        <summary className="danger-summary">Delete account</summary>
        <p className="small">Deletes your account and the copy stored in it. This can’t be undone. The data on this phone stays, and you can keep using the app without an account.</p>
        <button className="block danger" onClick={() => {
          if (!confirm('Delete your account and its copy of your data? This cannot be undone. Data on this phone stays.')) return;
          void run(a.deleteAccount);
        }}>Delete my account</button>
      </details>
    </>
  );
}

export function SyncLine() {
  const a = useAccount();
  const at = a.status.kind === 'synced' ? a.status.at : lastSyncedAt(a.session?.user.id);
  const icon = a.status.kind === 'offline' ? 'cloudOff' : a.status.kind === 'error' || a.status.kind === 'conflict' ? 'alert' : a.status.kind === 'synced' ? 'check' : 'sync';
  return (
    <>
      <p className={`sync-line ${a.status.kind}`} role="status"><Icon name={icon} size="sm" />{syncText(a.status, at)}</p>
      {a.status.kind === 'error' && <p className="hint">If this keeps happening, the account service may be paused after a week without use. It can be restored from the Supabase dashboard.</p>}
    </>
  );
}

function Copy({ title, s, extra }: { title: string; s: CopySummary; extra?: string }) {
  return (
    <div className="copy-card">
      <h3>{title}</h3>
      {extra && <p className="hint" style={{ marginTop: 0 }}>{extra}</p>}
      <ul className="small">
        <li><span className="num">{s.workouts}</span> finished workouts</li>
        <li><span className="num">{s.foodEntries}</span> food entries</li>
        <li><span className="num">{s.weighIns}</span> weigh-ins</li>
        <li>Latest record: <span className="num">{s.lastDate ?? 'none'}</span></li>
      </ul>
    </div>
  );
}

function Conflict({ local, cloud, reason }: { local: CopySummary; cloud: CopySummary & { updatedAt: string; device: string | null }; reason: string }) {
  const a = useAccount();
  return (
    <section className="panel review-changes" aria-labelledby="conflict-h">
      <h2 id="conflict-h">Choose which copy to keep</h2>
      <p className="small" style={{ marginTop: 6 }}>{reason} Rep Ledger won’t guess, because the copy you don’t keep is replaced.</p>
      <div className="copy-grid">
        <Copy title="This phone" s={local} />
        <Copy title="Your account" s={cloud} extra={`Updated ${when(cloud.updatedAt)}${cloud.device ? ` (${cloud.device})` : ''}`} />
      </div>
      <p className="hint">Not sure? Export a backup from <Link to="/settings">Settings</Link> first, so nothing is lost either way.</p>
      <div className="stack">
        <button className="primary block" onClick={() => {
          if (confirm('Replace the copy in your account with this phone’s data?')) void a.resolve('phone');
        }}>Keep this phone’s data</button>
        <button className="block" onClick={() => {
          if (confirm('Replace everything on this phone with your account’s copy?')) void a.resolve('account');
        }}>Keep the account copy</button>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <details className="panel">
      <summary>Privacy</summary>
      <p className="small">Your account copy is stored by Supabase, the service behind sign-in. Only your signed-in account can read it: the database refuses everyone else. Supabase encrypts it on disk, but it isn’t end-to-end encrypted, so Supabase could technically access it.</p>
      <p className="small">Signing in with Google shares only your name, email and profile picture with this app, and only the email is used. Nothing is sold or shared, and there are no ads or tracking.</p>
    </details>
  );
}
