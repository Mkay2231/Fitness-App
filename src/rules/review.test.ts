import { describe, expect, it } from 'vitest';
import { addDays, weekStart } from './dates';
import { buildWeeklyReview, type FoodDaySummary, type ReviewInput } from './review';
import { weeklyRate, sevenDayAverage } from './trend';
import { setsByMuscle } from './volume';

const monday = '2026-10-19';
const targets = { calories: 2750, proteinG: 110, fatG: 75, carbsG: 410 };
const empty: ReviewInput = {
  weekStart: monday,
  asOf: '2026-10-25',
  plannedWeekdays: [1, 3, 5],
  completedSessionDates: [],
  setsByMuscle: {},
  foodDays: [],
  weighIns: [],
  targets,
  gainRatePctPerWeek: 0.4,
};

describe('dates', () => {
  it('finds Monday', () => {
    expect(weekStart('2026-10-25')).toBe(monday); // Sunday
    expect(weekStart(monday)).toBe(monday);
  });
});

describe('trend', () => {
  it('needs enough weigh-ins', () => {
    const few = [0, 1, 2].map((i) => ({ date: addDays('2026-10-12', i), kg: 62 }));
    expect(weeklyRate(few, '2026-10-25')).toBeNull();
  });

  it('measures a steady gain', () => {
    const daily = Array.from({ length: 14 }, (_, i) => ({ date: addDays('2026-10-12', i), kg: 62 + (0.3 / 7) * i }));
    expect(weeklyRate(daily, '2026-10-25')).toBeCloseTo(0.3);
    expect(sevenDayAverage(daily, '2026-10-25')).toBeCloseTo(62 + (0.3 / 7) * 10);
  });
});

describe('weekly review', () => {
  it('reports missing data as not logged, never as zero intake', () => {
    const r = buildWeeklyReview(empty);
    expect(r.nutrition.notLoggedDays).toBe(7);
    expect(r.nutrition.avgKcal).toBeNull();
    expect(r.weight.avg7).toBeNull();
    expect(r.calorieCheck.kind).toBe('insufficient-data');
    expect(r.recommendations).toEqual([]);
  });

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

  it('averages only complete food days', () => {
    const foodDays: FoodDaySummary[] = [
      { date: '2026-10-19', status: 'complete', kcal: 2600, proteinG: 100 },
      { date: '2026-10-20', status: 'partial', kcal: 900, proteinG: 30 },
      { date: '2026-10-21', status: 'complete', kcal: 2800, proteinG: 120 },
    ];
    const r = buildWeeklyReview({ ...empty, foodDays });
    expect(r.nutrition).toMatchObject({ completeDays: 2, partialDays: 1, notLoggedDays: 4, avgKcal: 2700, avgProteinG: 110 });
  });

  it('recommends more calories when the weight trend is flat', () => {
    const weighIns = Array.from({ length: 14 }, (_, i) => ({ date: addDays('2026-10-12', i), kg: 62 }));
    const foodDays = weighIns.map((w) => ({ date: w.date, status: 'complete' as const, kcal: 2750, proteinG: 110 }));
    const r = buildWeeklyReview({ ...empty, weighIns, foodDays });
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0]).toMatchObject({ kind: 'calories', from: 2750, to: 3000, key: '2026-10-19:calories' });
  });
});

describe('volume', () => {
  it('counts helpers as half a set', () => {
    const muscles = { bench: { primary: 'chest', secondary: ['triceps'] }, pushdown: { primary: 'triceps', secondary: [] } };
    expect(setsByMuscle(['bench', 'bench', 'pushdown', 'unknown'], muscles)).toEqual({ chest: 2, triceps: 2 });
  });
});
