// Who is signed in, and the sync status every screen can read.
// Sync runs after sign-in, a few seconds after you log something, when the app comes
// back to the front, and when the internet returns. Logging itself never waits for it.

import type { Session } from '@supabase/supabase-js';
import Dexie from 'dexie';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase, supabaseRemote } from './cloud';
import { deleteAllData } from './data';
import { deviceLabel } from './rules/sync';
import { clearSyncState, readSyncState, resolveConflict, runSync, type SyncResult } from './sync';

export type SyncStatus =
  | { kind: 'off' }
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }
  | SyncResult;

interface Account {
  /** False when this build has no account service set up. */
  enabled: boolean;
  /** undefined while the saved sign-in is being read. */
  session: Session | null | undefined;
  /** True after opening a password-reset link, until a new password is saved. */
  recovering: boolean;
  doneRecovering: () => void;
  status: SyncStatus;
  syncNow: () => Promise<void>;
  resolve: (keep: 'phone' | 'account') => Promise<void>;
  /** Signs out on this phone. With removeData, also deletes this phone's data (the account copy stays). */
  signOut: (removeData?: boolean) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const Ctx = createContext<Account | null>(null);

export const device = () => deviceLabel(navigator.userAgent);

const DEBOUNCE_MS = 4000;
const CHECK_EVERY_MS = 5 * 60 * 1000;

export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  const [recovering, setRecovering] = useState(false);
  const [status, setStatus] = useState<SyncStatus>(supabase ? { kind: 'idle' } : { kind: 'off' });
  const userId = session?.user.id;
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true);
        location.hash = '#/account';
      }
    });
    // A sign-in link opened in a different browser can't finish there; drop the leftover code.
    void supabase.auth.getSession().then(({ data: d }) => {
      const u = new URL(location.href);
      if (!d.session && u.searchParams.has('code')) {
        u.searchParams.delete('code');
        history.replaceState(history.state, '', u.toString());
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const sync = useCallback(async (force = false) => {
    if (!supabase || !userId) return;
    // While you're choosing between two copies, only an explicit "Sync now" checks again.
    if (!force && statusRef.current.kind === 'conflict') return;
    if (!navigator.onLine) { setStatus({ kind: 'offline' }); return; }
    setStatus({ kind: 'syncing' });
    try {
      setStatus(await runSync(supabaseRemote(supabase, userId), userId, device()));
    } catch (e) {
      setStatus(navigator.onLine ? { kind: 'error', message: (e as Error).message } : { kind: 'offline' });
    }
  }, [userId]);

  // Sync on sign-in, then whenever the data changes, the app returns to the front, or the internet returns.
  useEffect(() => {
    if (!userId) { setStatus(supabase ? { kind: 'idle' } : { kind: 'off' }); return; }
    void sync();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => void sync(), DEBOUNCE_MS); };
    const onVisible = () => { if (document.visibilityState === 'visible') void sync(); };
    const onOnline = () => void sync();
    const onOffline = () => setStatus((s) => (s.kind === 'conflict' ? s : { kind: 'offline' }));
    Dexie.on('storagemutated', soon);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const every = setInterval(() => { if (document.visibilityState === 'visible') void sync(); }, CHECK_EVERY_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(every);
      Dexie.on('storagemutated').unsubscribe(soon);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [userId, sync]);

  const resolve = useCallback(async (keep: 'phone' | 'account') => {
    if (!supabase || !userId) return;
    setStatus({ kind: 'syncing' });
    try {
      await resolveConflict(supabaseRemote(supabase, userId), userId, device(), keep);
      setStatus({ kind: 'synced', decision: { action: keep === 'phone' ? 'upload' : 'download', reason: keep === 'phone' ? 'You kept this phone’s data.' : 'You kept your account’s copy.' }, at: new Date().toISOString() });
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  }, [userId]);

  const signOut = useCallback(async (removeData = false) => {
    if (!supabase) return;
    if (removeData) {
      if (!userId) return;
      // Make sure nothing on this phone is lost: it must be fully synced first.
      const r = await runSync(supabaseRemote(supabase, userId), userId, device());
      if (r.kind !== 'synced') throw new Error('This phone has changes that aren’t in your account yet, so its data was kept. Sync first, then try again.');
    }
    await supabase.auth.signOut({ scope: 'local' });
    clearSyncState();
    if (removeData) {
      await deleteAllData();
      location.reload();
    }
  }, [userId]);

  const deleteAccount = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw new Error(`Couldn’t delete your account: ${error.message}`);
    await supabase.auth.signOut({ scope: 'local' });
    clearSyncState();
  }, []);

  const value: Account = {
    enabled: !!supabase, session, recovering, doneRecovering: () => setRecovering(false),
    status, syncNow: () => sync(true), resolve, signOut, deleteAccount,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): Account {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAccount must be used inside AccountProvider');
  return a;
}

/** When this phone last agreed with the account, for the signed-in user. */
export function lastSyncedAt(userId: string | undefined): string | null {
  return userId ? readSyncState(userId)?.at ?? null : null;
}

/** Signs out locally before "Delete all data", so the account doesn't immediately restore it. */
export async function signOutBeforeWipe() {
  await supabase?.auth.signOut({ scope: 'local' });
  clearSyncState();
}
