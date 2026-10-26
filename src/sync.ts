// Keeps this phone and the copy in your account in step. The phone is always the
// working copy: logging never waits for the internet, and sync runs afterwards.

import { importAll, snapshot, type Snapshot } from './data';
import { canonicalJson, decideSync, type SyncDecision } from './rules/sync';

export interface CloudMeta { version: number; hash: string; updatedAt: string; device: string | null }

/** Where the account copy lives. The real one is Supabase (cloud.ts); tests use an in-memory one. */
export interface Remote {
  meta(): Promise<CloudMeta | null>;
  fetch(): Promise<{ meta: CloudMeta; data: Snapshot } | null>;
  /** Writes only if the account is still at `expected` (null = no copy yet). Returns null if another device wrote first. */
  put(expected: number | null, data: Snapshot, hash: string, device: string): Promise<CloudMeta | null>;
}

export interface SyncState { userId: string; version: number; hash: string; at: string }

const STATE_KEY = 'rl-sync';

export function readSyncState(userId: string): SyncState | null {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as SyncState | null;
    return s?.userId === userId ? s : null;
  } catch {
    return null;
  }
}

function writeSyncState(s: SyncState) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* storage unavailable: next sync compares again */ }
}

export function clearSyncState() {
  try { localStorage.removeItem(STATE_KEY); } catch { /* nothing to clear */ }
}

export async function hashSnapshot(s: Snapshot): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(s.data)));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Counts shown when you choose between two copies. */
export interface CopySummary { workouts: number; foodEntries: number; weighIns: number; lastDate: string | null }

export function summarise(s: Snapshot): CopySummary {
  const dates = ['sessions', 'foodEntries', 'weights', 'measurements', 'checkins']
    .flatMap((t) => (s.data[t] ?? []).map((r) => (r as { date?: string }).date))
    .filter((d): d is string => typeof d === 'string')
    .sort();
  const finished = (s.data.sessions ?? []).filter((r) => (r as { finishedAt?: string | null }).finishedAt);
  return { workouts: finished.length, foodEntries: (s.data.foodEntries ?? []).length, weighIns: (s.data.weights ?? []).length, lastDate: dates.at(-1) ?? null };
}

export type SyncResult =
  | { kind: 'synced'; decision: SyncDecision; at: string }
  | { kind: 'empty'; decision: SyncDecision }
  | { kind: 'conflict'; decision: SyncDecision; local: CopySummary; cloud: CopySummary & { updatedAt: string; device: string | null } };

const now = () => new Date().toISOString();

async function local() {
  const s = await snapshot();
  return { s, hash: await hashSnapshot(s), hasProfile: (s.data.settings ?? []).length > 0 };
}

async function upload(remote: Remote, userId: string, expected: number | null, s: Snapshot, hash: string, device: string) {
  const meta = await remote.put(expected, s, hash, device);
  if (!meta) return false;
  writeSyncState({ userId, version: meta.version, hash, at: now() });
  return true;
}

async function download(remote: Remote, userId: string) {
  const copy = await remote.fetch();
  if (!copy) throw new Error('Your account copy disappeared while syncing. Try again.');
  await importAll(JSON.stringify(copy.data));
  // Hash what actually landed on this phone, so the next comparison starts from it.
  writeSyncState({ userId, version: copy.meta.version, hash: (await local()).hash, at: now() });
}

// One sync at a time: a change made mid-sync is picked up by the next run.
let running: Promise<SyncResult> | null = null;

export function runSync(remote: Remote, userId: string, device: string): Promise<SyncResult> {
  running ??= (async () => {
    try {
      // Two tries: if another device uploads between our check and our write, compare again.
      for (let attempt = 0; attempt < 2; attempt++) {
        const l = await local();
        const meta = await remote.meta();
        const last = readSyncState(userId);
        const decision = decideSync({ local: l, last, cloud: meta });
        switch (decision.action) {
          case 'none':
            return l.hasProfile || meta ? { kind: 'synced', decision, at: last?.at ?? now() } : { kind: 'empty', decision };
          case 'mark':
            writeSyncState({ userId, version: meta!.version, hash: l.hash, at: now() });
            return { kind: 'synced', decision, at: now() };
          case 'upload':
            if (await upload(remote, userId, meta?.version ?? null, l.s, l.hash, device)) return { kind: 'synced', decision, at: now() };
            continue;
          case 'download':
            await download(remote, userId);
            return { kind: 'synced', decision, at: now() };
          case 'conflict': {
            const copy = await remote.fetch();
            if (!copy) continue;
            return { kind: 'conflict', decision, local: summarise(l.s), cloud: { ...summarise(copy.data), updatedAt: copy.meta.updatedAt, device: copy.meta.device } };
          }
        }
      }
      throw new Error('Another device kept syncing at the same moment. Try again in a minute.');
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Settles a conflict: 'phone' replaces the account copy with this phone's data, 'account' does the reverse. */
export async function resolveConflict(remote: Remote, userId: string, device: string, keep: 'phone' | 'account') {
  await running?.catch(() => {});
  if (keep === 'account') return download(remote, userId);
  const l = await local();
  const meta = await remote.meta();
  if (!(await upload(remote, userId, meta?.version ?? null, l.s, l.hash, device))) {
    throw new Error('Your account changed again while you were choosing. Look at both copies once more.');
  }
}
