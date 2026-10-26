import { describe, expect, it } from 'vitest';
import { addDays, weekStart } from './dates';
import { buildWeeklyReview, type FoodDaySummary, type ReviewInput } from './review';
import { weeklyRate, sevenDayAverage } from './trend';
import { setsByMuscle } from './volume';

const monday = '2026-10-19';
const targets = { calories: 2750, proteinG: 110, fatG: 75, carbsG: 410 };
const empty: ReviewInput = {
  weekStart: monday,
  asOf: '2026-10-26', // the Monday after: the whole week is in the past
  plannedWeekdays: [1, 3, 5],
  completedSessionDates: [],
  setsByMuscle: {},
  foodDays: [],
  weighIns: [],
  targets,
  gainRatePctPerWeek: 0.4,
};
const days14 = (from: string) => Array.from({ length: 14 }, (_, i) => addDays(from, i));
const complete = (date: string, kcal = 2750, proteinG = 110): FoodDaySummary => ({ date, status: 'complete', kcal, proteinG });
const sess = (date: string, w: number | null, ...reps: number[]) => ({ date, sets: reps.map((r) => ({ weightKg: w, reps: r, rir: null })) });
const kinds = (r: ReturnType<typeof buildWeeklyReview>) => r.recommendations.map((x) => x.kind);

describe('dates and trend', () => {
  it('finds Monday', () => {
    expect(weekStart('2026-10-25')).toBe(monday);
    expect(weekStart(monday)).toBe(monday);
  });

  it('needs enough weigh-ins', () => {
    expect(weeklyRate([0, 1, 2].map((i) => ({ date: addDays('2026-10-12', i), kg: 62 })), '2026-10-25')).toBeNull();
  });

  it('measures a steady gain', () => {
    const daily = days14('2026-10-12').map((date, i) => ({ date, kg: 62 + (0.3 / 7) * i }));
    expect(weeklyRate(daily, '2026-10-25')).toBeCloseTo(0.3);
    expect(sevenDayAverage(daily, '2026-10-25')).toBeCloseTo(62 + (0.3 / 7) * 10);
  });
});

describe('sparse data', () => {
  it('with nothing logged: holds the plan, lists what is missing, and invents nothing', () => {
    const r = buildWeeklyReview(empty);
    expect(r.nutrition).toMatchObject({ notLoggedDays: 7, avgKcal: null, sufficient: false });
    expect(r.weight.avg7).toBeNull();
    expect(r.calorieCheck.kind).toBe('insufficient-data');
    expect(kinds(r)).toContain('hold');
    expect(r.recommendations.find((x) => x.kind === 'hold')!.type).toBe('action');
    expect(r.recommendations.some((x) => x.type === 'change')).toBe(false);
    expect(r.gaps.join(' ')).toMatch(/0 weigh-ins this week/);
    expect(r.gaps.join(' ')).toMatch(/No weight trend yet/);
    expect(r.summary).toContain('No weigh-ins this week.');
  });

  it('with a few records: still holds and says what more is needed', () => {
    const r = buildWeeklyReview({ ...empty, weighIns: [{ date: '2026-10-20', kg: 62 }, { date: '2026-10-23', kg: 62.2 }], foodDays: [complete('2026-10-20')] });
    expect(r.calorieCheck.kind).toBe('insufficient-data');
    expect(r.recommendations[0]).toMatchObject({ kind: 'hold', title: 'Keep your plan as it is and keep logging' });
    expect(r.recommendations[0].evidence.join(' ')).toMatch(/8 weigh-ins/);
  });
});

describe('incomplete food logs', () => {
  it('withholds averages until enough days are complete', () => {
    const foodDays = [complete('2026-10-19', 2600, 100), { date: '2026-10-20', status: 'partial' as const, kcal: 900, proteinG: 30 }, complete('2026-10-21', 2800, 120)];
    const r = buildWeeklyReview({ ...empty, foodDays });
    expect(r.nutrition).toMatchObject({ completeDays: 2, partialDays: 1, notLoggedDays: 4, sufficient: false, avgKcal: null });
    expect(r.gaps.join(' ')).toMatch(/2 complete food days this week; averages need 4/);
    expect(r.gaps.join(' ')).toMatch(/1 day with food logged but not marked complete/);
  });

  it('averages only complete days once there are enough, and flags suspiciously low ones', () => {
    const foodDays = [complete('2026-10-19', 2600, 100), complete('2026-10-20', 2800, 120), complete('2026-10-21', 2700, 110), complete('2026-10-22', 900, 40),
      { date: '2026-10-23', status: 'partial' as const, kcal: 300, proteinG: 10 }];
    const r = buildWeeklyReview({ ...empty, foodDays });
    expect(r.nutrition).toMatchObject({ completeDays: 4, sufficient: true, avgKcal: 2250, avgProteinG: 92.5 });
    expect(r.nutrition.suspiciousDays).toEqual(['2026-10-22']);
    expect(r.gaps.join(' ')).toMatch(/under 40% of your calorie target: 2026-10-22/);
  });
});

describe('missed workouts', () => {
  it('splits planned sessions into done, missed and upcoming', () => {
    const r = buildWeeklyReview({ ...empty, asOf: '2026-10-22', completedSessionDates: ['2026-10-19', '2026-10-20'] });
    expect(r.training.completed).toEqual(['2026-10-19']);
    expect(r.training.missed).toEqual(['2026-10-21']);
    expect(r.training.upcoming).toEqual(['2026-10-23']);
    expect(r.training.extra).toEqual(['2026-10-20']);
  });

  it('does not count today as missed before it is over', () => {
    const r = buildWeeklyReview({ ...empty, asOf: '2026-10-21' });
    expect(r.training.missed).toEqual(['2026-10-19']);
    expect(r.training.upcoming).toEqual(['2026-10-21', '2026-10-23']);
  });

  it('suggests protecting training days, with the dates as evidence', () => {
    const r = buildWeeklyReview({ ...empty, completedSessionDates: ['2026-10-19'] });
    const rec = r.recommendations.find((x) => x.kind === 'adherence')!;
    expect(rec.title).toMatch(/1 of 3 done/);
    expect(rec.evidence).toContain('Not logged: 2026-10-21, 2026-10-23.');
    expect(rec.rule).toMatch(/programme rotates/);
  });
});

describe('conflicting trends', () => {
  const fastGain = days14('2026-10-12').map((date, i) => ({ date, kg: 62 + (0.8 / 7) * i }));
  const flatWeight = days14('2026-10-12').map((date) => ({ date, kg: 62 }));
  const sameLifts = [
    { exerciseId: 'a', name: 'Leg press', latest: sess('2026-10-21', 40, 10, 10), previous: sess('2026-10-14', 40, 10, 10) },
    { exerciseId: 'b', name: 'Lat pulldown', latest: sess('2026-10-21', 35, 10), previous: sess('2026-10-14', 35, 10) },
  ];
  const betterLifts = [
    { exerciseId: 'a', name: 'Leg press', latest: sess('2026-10-21', 45, 10), previous: sess('2026-10-14', 40, 10) },
    { exerciseId: 'b', name: 'Lat pulldown', latest: sess('2026-10-21', 40, 10), previous: sess('2026-10-14', 35, 10) },
  ];

  it('flags weight rising faster than planned without strength gains', () => {
    const r = buildWeeklyReview({ ...empty, weighIns: fastGain, exercises: sameLifts });
    expect(r.conflicts.join(' ')).toMatch(/rising faster than planned .* none of 2 compared lifts improved/);
  });

  it('flags strength up while weight is flat, without claiming muscle', () => {
    const r = buildWeeklyReview({ ...empty, weighIns: flatWeight, exercises: betterLifts });
    expect(r.conflicts.join(' ')).toMatch(/2 lifts improved while weight held or fell/);
    expect(r.conflicts.join(' ')).toMatch(/doesn't prove muscle/);
  });

  it('flags intake above target while weight falls', () => {
    const falling = days14('2026-10-12').map((date, i) => ({ date, kg: 63 - 0.05 * i }));
    const r = buildWeeklyReview({ ...empty, weighIns: falling, foodDays: days14('2026-10-12').map((d) => complete(d, 3100)) });
    expect(r.conflicts.join(' ')).toMatch(/above target .* yet weight fell/);
  });

  it('never phrases weight gain as muscle gain', () => {
    const r = buildWeeklyReview({ ...empty, weighIns: fastGain, exercises: betterLifts, foodDays: days14('2026-10-12').map((d) => complete(d)) });
    const text = [...r.summary, ...r.conflicts, ...r.recommendations.flatMap((x) => [x.title, ...x.evidence])].join(' ');
    expect(text).not.toMatch(/gained muscle|muscle gain(ed)? (is|was) (shown|proven)/i);
  });
});

describe('suggestions', () => {
  it('recommends more calories when the weight trend is flat, with evidence and rule', () => {
    const weighIns = days14('2026-10-12').map((date) => ({ date, kg: 62 }));
    const r = buildWeeklyReview({ ...empty, completedSessionDates: ['2026-10-19', '2026-10-21', '2026-10-23'], weighIns, foodDays: weighIns.map((w) => complete(w.date)) });
    expect(r.recommendations[0]).toMatchObject({ kind: 'calories', type: 'change', from: 2750, to: 3000, key: '2026-10-19:calories' });
    expect(r.recommendations[0].rule).toMatch(/capped at ±250 kcal/);
    expect(r.recommendations[0].evidence.length).toBeGreaterThan(1);
  });

  it('asks for recovery check-ins when lifts drop and none were logged', () => {
    const downs = [
      { exerciseId: 'a', name: 'Leg press', latest: sess('2026-10-21', 40, 6), previous: sess('2026-10-14', 40, 10) },
      { exerciseId: 'b', name: 'Lat pulldown', latest: sess('2026-10-21', 35, 6), previous: sess('2026-10-14', 35, 10) },
    ];
    const r = buildWeeklyReview({ ...empty, completedSessionDates: ['2026-10-19', '2026-10-21', '2026-10-23'], exercises: downs });
    expect(r.recommendations.find((x) => x.kind === 'recovery')!.title).toBe('Log sleep and energy for a few days');
    const withSleep = buildWeeklyReview({
      ...empty, completedSessionDates: ['2026-10-19', '2026-10-21', '2026-10-23'], exercises: downs,
      checkIns: ['2026-10-20', '2026-10-21', '2026-10-22'].map((date) => ({ date, sleepHours: 5.5, energy: 2, soreness: 3 })),
    });
    const rec = withSleep.recommendations.find((x) => x.kind === 'recovery')!;
    expect(rec.title).toBe('Prioritise sleep and recovery this week');
    expect(rec.evidence.join(' ')).toMatch(/Sleep 5\.5 h/);
    expect(withSleep.wellbeing).toMatchObject({ entries: 3, sleepAvg: 5.5, energyAvg: 2, sorenessAvg: 3 });
  });

  it('shows at most three suggestions, plan changes first', () => {
    const weighIns = days14('2026-10-12').map((date) => ({ date, kg: 70 }));
    const downs = ['a', 'b'].map((id) => ({ exerciseId: id, name: id, latest: sess('2026-10-21', 40, 6), previous: sess('2026-10-14', 40, 10) }));
    const r = buildWeeklyReview({ ...empty, weighIns, foodDays: weighIns.map((w) => complete(w.date)), exercises: downs });
    expect(r.recommendations).toHaveLength(3);
    expect(kinds(r).slice(0, 2)).toEqual(['calories', 'protein']);
  });
});

describe('volume', () => {
  it('counts helpers as half a set', () => {
    const muscles = { bench: { primary: 'chest', secondary: ['triceps'] }, pushdown: { primary: 'triceps', secondary: [] } };
    expect(setsByMuscle(['bench', 'bench', 'pushdown', 'unknown'], muscles)).toEqual({ chest: 2, triceps: 2 });
  });
});
