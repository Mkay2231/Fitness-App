import { describe, expect, it } from 'vitest';
import { PROGRAM_TEMPLATES } from '../seed/programs';
import { buildProgram, estimateMinutes, programChanges } from './program';

const gym = PROGRAM_TEMPLATES.find((p) => p.id === 'gym-full-body')!;
const home = PROGRAM_TEMPLATES.find((p) => p.id === 'home-full-body')!;
const base = { experience: 'some' as const, sessionMinutes: 60, limitations: [] };
const ids = (p: ReturnType<typeof buildProgram>, day = 0) => p.days[day].slots.map((s) => s.exerciseId);

describe('program builder', () => {
  it('leaves the template alone for a 60-minute session with some experience', () => {
    expect(buildProgram(gym, base)).toEqual(gym);
  });

  it('asks new lifters to stop 3 reps short', () => {
    const p = buildProgram(gym, { ...base, experience: 'new' });
    expect(p.days.flatMap((d) => d.slots).every((s) => s.targetRir === 3 && s.note)).toBe(true);
  });

  it('adds a set to main lifts for experienced lifters', () => {
    const p = buildProgram(gym, { ...base, experience: 'experienced', sessionMinutes: 75 });
    expect(p.days[0].slots.slice(0, 3).map((s) => s.sets)).toEqual([4, 4, 4]);
    expect(p.days[0].slots[3].sets).toBe(3);
  });

  it('fits shorter sessions by dropping accessories first', () => {
    const p = buildProgram(gym, { ...base, sessionMinutes: 30 });
    for (const d of p.days) {
      expect(estimateMinutes(d)).toBeLessThanOrEqual(30);
      expect(d.slots.length).toBeGreaterThanOrEqual(4);
    }
    expect(ids(p)).not.toContain('cable-pushdown');
  });

  it('trims sets evenly when a short session needs it', () => {
    const p = buildProgram(home, { ...base, experience: 'experienced', sessionMinutes: 30 });
    for (const d of p.days) {
      const sets = d.slots.map((s) => s.sets);
      expect(Math.max(...sets) - Math.min(...sets)).toBeLessThanOrEqual(1);
      expect(Math.min(...sets)).toBeGreaterThanOrEqual(2);
    }
  });

  it('swaps exercises for limitations, by setting', () => {
    const g = buildProgram(gym, { ...base, limitations: ['lowerBack'] });
    expect(ids(g)).toContain('leg-curl');
    expect(ids(g)).not.toContain('db-rdl');
    expect(g.days[0].slots.find((s) => s.exerciseId === 'leg-curl')!.note).toMatch(/lower back/);
    const h = buildProgram(home, { ...base, limitations: ['lowerBack', 'knees', 'wrists'] });
    expect(ids(h, 0)).toEqual(expect.arrayContaining(['glute-bridge', 'box-squat']));
    expect(ids(h, 1)).not.toContain('push-up');
    expect(ids(h, 1)).not.toContain('db-bent-row');
  });

  it('never repeats an exercise within a day', () => {
    const p = buildProgram(home, { ...base, limitations: ['knees', 'lowerBack', 'shoulders', 'wrists'] });
    for (const d of p.days) expect(new Set(ids(p, p.days.indexOf(d))).size).toBe(d.slots.length);
  });

  it('describes changes for review', () => {
    const before = buildProgram(gym, base);
    const after = buildProgram(gym, { ...base, sessionMinutes: 30, limitations: ['shoulders'] });
    const changes = programChanges(before, after, { 'cable-pushdown': 'Cable triceps pushdown' });
    expect(changes.some((c) => c.includes('remove Cable triceps pushdown'))).toBe(true);
    expect(programChanges(before, before, {})).toEqual([]);
  });
});
