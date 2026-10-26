// Storage-level tests against an in-memory IndexedDB (fake-indexeddb).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

// Minimal localStorage for deleteAllData in Node.
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
const { csvCell, deleteAllData, exportAll, exportCsv, importAll, syncBuiltIns, withProfileDefaults } = await import('./data');
const { addDays, daysBetween, weekStart, isoWeekday } = await import('./rules/dates');

const profile = {
  id: 'me' as const, sex: 'male' as const, age: 25, heightCm: 175, startWeightKg: 62, activity: 'moderate' as const,
  gainRatePctPerWeek: 0.4, experience: 'some' as const, setting: 'gym' as const, trainingDays: [1, 3, 5], sessionMinutes: 60,
  limitations: [], avoidFoods: [], weightUnit: 'kg' as const, lengthUnit: 'cm' as const,
  increments: { barbell: 2.5, dumbbell: 2, machine: 5, cable: 5, bodyweight: 0 }, aiEnabled: false, createdAt: '2026-10-01T00:00:00Z',
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await syncBuiltIns();
  await db.settings.put(profile);
  await db.weights.put({ date: '2026-10-20', kg: 62.4 });
});

describe('dates across boundaries', () => {
  it('handles month, year and leap-day boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(daysBetween('2026-12-25', '2027-01-08')).toBe(14);
    expect(weekStart('2027-01-01')).toBe('2026-12-28'); // a Friday → the Monday before, in the previous year
    expect(isoWeekday('2026-11-01')).toBe(7); // Sunday
  });
});

describe('CSV export', () => {
  it('escapes commas, quotes and newlines', () => {
    expect(csvCell('Eba, egusi')).toBe('"Eba, egusi"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(62.4)).toBe('62.4');
  });

  it('exports weigh-ins and food with sources', async () => {
    expect(await exportCsv('weights')).toBe('date,weight_kg\r\n2026-10-20,62.4');
    await db.foodEntries.add({ date: '2026-10-20', slot: 'lunch', foodId: 'wafct-01_069', grams: 200, portionText: '2 serving spoons', loggedAt: 'x' });
    const csv = await exportCsv('food');
    expect(csv.split('\r\n')[1]).toMatch(/^2026-10-20,no,lunch,"White rice, boiled",2 serving spoons,200,236,/);
    expect(csv).toMatch(/FAO\/INFOODS/);
  });
});

describe('backup restore', () => {
  it('round-trips a full export', async () => {
    const json = await exportAll();
    await db.weights.clear();
    await importAll(json);
    expect(await db.weights.toArray()).toEqual([{ date: '2026-10-20', kg: 62.4 }]);
    expect((await db.settings.get('me'))?.age).toBe(25);
  });

  it.each([
    ['not JSON', 'oops {', /isn't valid JSON/],
    ['another app', JSON.stringify({ app: 'other', data: {} }), /not a Rep Ledger backup/],
    ['a newer version', JSON.stringify({ app: 'rep-ledger', version: 9, data: { settings: [profile] } }), /newer version/],
    ['no profile', JSON.stringify({ app: 'rep-ledger', version: 1, data: { weights: [] } }), /no profile/],
  ])('rejects %s and leaves existing data untouched', async (_, json, message) => {
    await expect(importAll(json)).rejects.toThrow(message);
    expect(await db.weights.count()).toBe(1);
    expect(await db.settings.get('me')).toBeTruthy();
  });

  it('restores a backup made before the profile fields existed', async () => {
    const { experience: _e, setting: _s, sessionMinutes: _m, limitations: _l, avoidFoods: _a, weightUnit: _w, lengthUnit: _lu, ...old } = profile;
    await importAll(JSON.stringify({ app: 'rep-ledger', version: 1, data: { settings: [old], weights: [{ date: '2026-09-01', kg: 60 }] } }));
    const s = await db.settings.get('me');
    expect(s).toMatchObject({ experience: 'new', setting: 'gym', sessionMinutes: 60, limitations: [], avoidFoods: [], weightUnit: 'kg', lengthUnit: 'cm', age: 25 });
    expect(await db.weights.toArray()).toEqual([{ date: '2026-09-01', kg: 60 }]);
    expect(await db.foods.count()).toBeGreaterThan(0); // built-in foods come back
  });

  it('keeps given profile values when filling defaults', () => {
    expect(withProfileDefaults({ weightUnit: 'lb', limitations: ['knees'] })).toMatchObject({ weightUnit: 'lb', limitations: ['knees'], lengthUnit: 'cm' });
  });
});

describe('delete all data', () => {
  it('removes the database and unfinished-workout drafts', async () => {
    localStorage.setItem('rl-draft-1', '{}');
    localStorage.setItem('rl-rest-1', '{}');
    localStorage.setItem('other-app', 'keep');
    await deleteAllData();
    await db.open();
    expect(await db.settings.count()).toBe(0);
    expect(await db.weights.count()).toBe(0);
    expect(localStorage.getItem('rl-draft-1')).toBeNull();
    expect(localStorage.getItem('rl-rest-1')).toBeNull();
    expect(localStorage.getItem('other-app')).toBe('keep');
  });
});
