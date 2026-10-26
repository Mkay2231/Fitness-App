// Deciding what to do when this phone and the account copy are compared.
// One snapshot per account; `version` goes up by one on every upload.

export type SyncAction = 'none' | 'mark' | 'upload' | 'download' | 'conflict';

export interface SyncInput {
  /** This phone right now. */
  local: { hash: string; hasProfile: boolean };
  /** What this phone and the account last agreed on; null if this phone never synced with this account. */
  last: { version: number; hash: string } | null;
  /** The account copy; null if the account has none yet. */
  cloud: { version: number; hash: string } | null;
}

export interface SyncDecision {
  /** mark = both already hold the same data, so only record that they agree. */
  action: SyncAction;
  reason: string;
}

export function decideSync({ local, last, cloud }: SyncInput): SyncDecision {
  // A phone with no profile (fresh install, or after deleting everything) never overwrites the account.
  if (!local.hasProfile) {
    return cloud
      ? { action: 'download', reason: 'This phone has no data yet, so it takes the copy in your account.' }
      : { action: 'none', reason: 'Neither this phone nor your account has any data yet.' };
  }
  if (!cloud) return { action: 'upload', reason: 'Your account has no copy yet, so this phone’s data is copied to it.' };
  if (cloud.hash === local.hash) return { action: last?.version === cloud.version && last.hash === local.hash ? 'none' : 'mark', reason: 'This phone and your account hold the same data.' };
  if (!last) return { action: 'conflict', reason: 'This phone and your account both have data, and it differs.' };

  const localChanged = local.hash !== last.hash;
  const cloudChanged = cloud.version !== last.version;
  if (localChanged && cloudChanged) return { action: 'conflict', reason: 'This phone and your account were both changed since they last synced.' };
  if (localChanged) return { action: 'upload', reason: 'This phone has changes your account doesn’t have yet.' };
  if (cloudChanged) return { action: 'download', reason: 'Your account has newer changes from another device.' };
  return { action: 'none', reason: 'Nothing has changed since the last sync.' };
}

/** JSON with object keys sorted, so the same data always gives the same text (and hash). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** A short, readable name for the device doing the upload, shown on the other phone. */
export function deviceLabel(userAgent: string): string {
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return /Mobile/.test(userAgent) ? 'Android phone' : 'Android tablet';
  if (/Windows/.test(userAgent)) return 'Windows computer';
  if (/Macintosh/.test(userAgent)) return 'Mac';
  if (/Linux/.test(userAgent)) return 'Linux computer';
  return 'another device';
}
