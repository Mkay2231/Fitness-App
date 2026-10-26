// Sync against an in-memory account, with two "phones" taking turns on one IndexedDB.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  },
});

const { db } = await import('./db');
const { deleteAllData, syncBuiltIns } = await import('./data');
const { resolveConflict, runSync } = await import('./sync');
type Remote = import('./sync').Remote;
type CloudMeta = import('./sync').CloudMeta;
type Snapshot = import('./data').Snapshot;

const profile = {
  id: 'me' as const, sex: 'male' as const, age: 25, heightCm: 175, startWeightKg: 62, activity: 'moderate' as const,
  gainRatePctPerWeek: 0.4, experience: 'some' as const, setting: 'gym' as const, trainingDays: [1, 3, 5], sessionMinutes: 60,
  limitations: [], avoidFoods: [], weightUnit: 'kg' as const, lengthUnit: 'cm' as const,
  increments: { barbell: 2.5, dumbbell: 2, machine: 5, cable: 5, bodyweight: 0 }, aiEnabled: false, createdAt: '2026-10-01T00:00:00Z',
};

/** The account copy, stored the way Postgres jsonb would give it back (keys reordered). */
function memoryRemote() {
  let row: { meta: CloudMeta; json: string } | null = null;
  const remote: Remote = {
    meta: async () => row?.meta ?? null,
    fetch: async () => (row ? { meta: row.meta, data: JSON.parse(row.json) as Snapshot } : null),
    put: async (expected, data, hash, device) => {
      if ((row?.meta.version ?? null) !== expected) return null;
      const reordered = JSON.stringify(data, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v));
      row = { meta: { version: (expected ?? 0) + 1, hash, updatedAt: new Date().toISOString(), device }, json: reordered };
      return row.meta;
    },
  };
  return { remote, get version() { return row?.meta.version ?? null; }, bumpElsewhere: async (data: Snapshot) => remote.put(row!.meta.version, data, 'elsewhere', 'iPhone') };
}

/** Switch to "another phone": empty database and no sync record, same account. */
async function freshPhone() {
  await deleteAllData();
  await db.open();
  await syncBuiltIns();
}

beforeEach(async () => {
  await freshPhone();
  await db.settings.put(profile);
  await db.weights.put({ date: '2026-10-20', kg: 62.4 });
});

describe('sync', () => {
  it('copies the phone to an empty account, then restores it on a new phone', async () => {
    const cloud = memoryRemote();
    expect((await runSync(cloud.remote, 'u1', 'Android phone')).kind).toBe('synced');
    expect(cloud.version).toBe(1);

    await freshPhone();
    expect(await db.settings.get('me')).toBeUndefined();
    await runSync(cloud.remote, 'u1', 'iPhone');
    expect((await db.settings.get('me'))?.age).toBe(25);
    expect(await db.weights.get('2026-10-20')).toEqual({ date: '2026-10-20', kg: 62.4 });
    // Built-in foods are not in the account copy, but the restored phone still has them.
    expect(await db.foods.count()).toBeGreaterThan(50);
    // A restored phone with no new changes doesn't upload again.
    await runSync(cloud.remote, 'u1', 'iPhone');
    expect(cloud.version).toBe(1);
  });

  it('uploads new changes and leaves an unchanged phone alone', async () => {
    const cloud = memoryRemote();
    await runSync(cloud.remote, 'u1', 'Android phone');
    await runSync(cloud.remote, 'u1', 'Android phone');
    expect(cloud.version).toBe(1);
    await db.weights.put({ date: '2026-10-21', kg: 62.6 });
    await runSync(cloud.remote, 'u1', 'Android phone');
    expect(cloud.version).toBe(2);
  });

  it('takes newer changes from another device when this phone has none', async () => {
    const cloud = memoryRemote();
    await runSync(cloud.remote, 'u1', 'Android phone');
    const other = (await cloud.remote.fetch())!.data;
    other.data.weights = [...other.data.weights, { date: '2026-10-22', kg: 63 }];
    await cloud.bumpElsewhere(other);
    await runSync(cloud.remote, 'u1', 'Android phone');
    expect((await db.weights.get('2026-10-22'))?.kg).toBe(63);
  });

  it('asks instead of overwriting when both changed, and keeps the copy you choose', async () => {
    const cloud = memoryRemote();
    await runSync(cloud.remote, 'u1', 'Android phone');
    const other = (await cloud.remote.fetch())!.data;
    other.data.weights = [...other.data.weights, { date: '2026-10-22', kg: 63 }];
    await cloud.bumpElsewhere(other);
    await db.weights.put({ date: '2026-10-23', kg: 63.2 });

    const r = await runSync(cloud.remote, 'u1', 'Android phone');
    expect(r.kind).toBe('conflict');
    if (r.kind !== 'conflict') return;
    expect(r.local.weighIns).toBe(2);
    expect(r.cloud).toMatchObject({ weighIns: 2, device: 'iPhone', lastDate: '2026-10-22' });
    // Nothing was overwritten while waiting for your choice.
    expect(await db.weights.get('2026-10-23')).toBeDefined();
    expect(cloud.version).toBe(2);

    await resolveConflict(cloud.remote, 'u1', 'Android phone', 'phone');
    expect(cloud.version).toBe(3);
    expect((await cloud.remote.fetch())!.data.data.weights).toHaveLength(2);
    expect((await runSync(cloud.remote, 'u1', 'Android phone')).kind).toBe('synced');
  });

  it('can settle a conflict by taking the account copy', async () => {
    const cloud = memoryRemote();
    await runSync(cloud.remote, 'u1', 'Android phone');
    const other = (await cloud.remote.fetch())!.data;
    other.data.weights = [{ date: '2026-10-22', kg: 63 }];
    await cloud.bumpElsewhere(other);
    await db.weights.put({ date: '2026-10-23', kg: 63.2 });
    await resolveConflict(cloud.remote, 'u1', 'Android phone', 'account');
    expect((await db.weights.toArray()).map((w) => w.date)).toEqual(['2026-10-22']);
    expect((await runSync(cloud.remote, 'u1', 'Android phone')).kind).toBe('synced');
    expect(cloud.version).toBe(2);
  });

  it('treats a phone that synced with a different account as new', async () => {
    const cloud = memoryRemote();
    await runSync(cloud.remote, 'u1', 'Android phone');
    const other = memoryRemote();
    await other.remote.put(null, { app: 'rep-ledger', version: 1, data: { settings: [{ ...profile, age: 40 }] } }, 'x', 'iPhone');
    expect((await runSync(other.remote, 'u2', 'Android phone')).kind).toBe('conflict');
  });
});
