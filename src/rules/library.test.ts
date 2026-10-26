import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../seed/exercises';
import { PROGRAM_TEMPLATES } from '../seed/programs';
import { alternativesFor, validateProgram } from './library';

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('substitutions', () => {
  it('offers same-muscle exercises, same equipment first', () => {
    const alts = ids(alternativesFor('db-bench', EXERCISES, 'gym'));
    expect(alts[0]).toBe('db-floor-press');
    expect(alts).toEqual(expect.arrayContaining(['machine-chest-press', 'push-up']));
    expect(alts).not.toContain('db-bench');
  });

  it('only offers home equipment at home', () => {
    const alts = alternativesFor('lat-pulldown', EXERCISES, 'home');
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((e) => e.equipment === 'dumbbell' || e.equipment === 'bodyweight')).toBe(true);
  });

  it('can exclude exercises already in the session', () => {
    expect(ids(alternativesFor('db-bench', EXERCISES, 'gym', ['db-floor-press']))).not.toContain('db-floor-press');
  });

  it('every built-in exercise has at least one alternative at the gym', () => {
    for (const e of EXERCISES) expect(alternativesFor(e.id, EXERCISES, 'gym').length, e.id).toBeGreaterThan(0);
  });
});

describe('programme validation', () => {
  it('accepts the built-in templates', () => {
    for (const t of PROGRAM_TEMPLATES) expect(validateProgram(t, EXERCISES)).toEqual([]);
  });

  it('explains each problem', () => {
    const t = structuredClone(PROGRAM_TEMPLATES[0]);
    t.days[0].name = ' ';
    t.days[0].slots[0].repMin = 12;
    t.days[0].slots[0].repMax = 8;
    t.days[0].slots[1].exerciseId = t.days[0].slots[2].exerciseId;
    t.days[1].slots = [];
    const errors = validateProgram(t, EXERCISES);
    expect(errors).toEqual(expect.arrayContaining([
      'Day 1 needs a name.',
      'Day 1, exercise 1: rep range must be whole numbers from 1 to 50, low to high.',
      expect.stringMatching(/Day 1, exercise 3: already in this day/),
      'Full body B needs at least one exercise.',
    ]));
  });
});
