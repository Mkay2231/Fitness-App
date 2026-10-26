// End-to-end check of Progress and the weekly review on real saved records.
// Seeds two weeks of data into the app's own database (through the dev server's
// modules), then checks what the screens show and that decisions persist.
//
//   npm run dev            (in one terminal)
//   npm run check:review   (in another)

import { chromium } from 'playwright-core';
import { completeSetup } from './lib/setup.mjs';

const URL = process.env.APP_URL || 'http://localhost:5173/';
const step = (msg) => console.log(`✓ ${msg}`);
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const browser = await chromium.launch({ channel: process.env.BROWSER || 'msedge', headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto(URL);
  await completeSetup(page, { experience: /Some experience/ });

  // Last week: Mon and Fri trained, Wed missed; two lifts dropped vs the week before;
  // short sleep; flat weight for 14 days; 14 complete food days at target.
  const seeded = await page.evaluate(async () => {
    const { db } = await import('/src/db.ts');
    const { addDays, weekStart, toISODate } = await import('/src/rules/dates.ts');
    const lastMon = addDays(weekStart(toISODate(new Date())), -7);
    const prevMon = addDays(lastMon, -7);
    const program = (await db.programs.toArray()).find((p) => p.active);
    async function session(date, dayId, lifts) {
      const id = await db.sessions.add({ programId: program.id, dayId, date, startedAt: `${date}T08:00:00.000Z`, finishedAt: `${date}T09:00:00.000Z` });
      for (const [exerciseId, weightKg, reps] of lifts) {
        for (let i = 0; i < 3; i++) await db.sets.add({ sessionId: id, exerciseId, date, setIndex: i, weightKg, reps, rir: null, loggedAt: `${date}T08:30:00.000Z` });
      }
    }
    await session(prevMon, 'A', [['leg-press', 40, 10], ['lat-pulldown', 35, 10]]);
    await session(addDays(prevMon, 2), 'B', [['goblet-squat', 12, 10]]);
    await session(addDays(prevMon, 4), 'A', [['leg-press', 40, 10], ['lat-pulldown', 35, 10]]);
    await session(lastMon, 'B', [['goblet-squat', 12, 10]]);
    await session(addDays(lastMon, 4), 'A', [['leg-press', 40, 6], ['lat-pulldown', 35, 6]]);
    const rice = await db.foods.get('wafct-01_069');
    for (let i = 0; i < 14; i++) {
      const date = addDays(prevMon, i);
      await db.weights.put({ date, kg: 62 });
      await db.foodEntries.add({ date, slot: 'lunch', foodId: rice.id, grams: (2750 / rice.kcal) * 100, portionText: 'seed', loggedAt: `${date}T12:00:00.000Z` });
      await db.foodDays.put({ date, complete: true });
    }
    for (const n of [0, 1, 2]) await db.checkins.put({ date: addDays(lastMon, n), sleepHours: 5.5, energy: 2, soreness: 3 });
    await db.measurements.add({ date: prevMon, site: 'Waist (at navel)', cm: 76 });
    await db.measurements.add({ date: addDays(lastMon, 6), site: 'Waist (at navel)', cm: 76.5 });
    return { lastMon };
  });
  await page.reload();
  step(`seeded two weeks of records (reviewing the week of ${seeded.lastMon})`);

  // Progress shows completion and the weight caveat
  await page.goto(`${URL}#/progress`);
  await page.getByRole('heading', { name: 'Workouts' }).waitFor();
  const lastWeekRow = await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Workouts' }) }).locator('li').nth(1).textContent();
  expect(/2 of 3 planned · 1 not logged/.test(lastWeekRow), `last week's completion wrong: ${lastWeekRow}`);
  await page.getByText(/it can't show muscle gain on its own/).waitFor();
  step(`Progress: workout completion (${lastWeekRow.trim()}) and a scale-weight caveat`);

  // Weekly review for last week
  await page.goto(`${URL}#/review`);
  await page.getByRole('heading', { name: 'This week in brief' }).waitFor();
  await page.getByRole('button', { name: 'Previous week' }).click();
  await page.getByText('You finished 2 of 3 planned sessions.').waitFor();
  await page.getByText(/0 up, 1 about the same, 2 down/).waitFor();
  step('summary is built from the records: 2 of 3 sessions; goblet squat the same, 2 lifts down');

  const cards = page.locator('article.suggestion');
  await cards.first().waitFor();
  const titles = await cards.locator('h3').allTextContents();
  expect(titles.length === 3, `expected 3 suggestions, got ${titles.length}: ${titles.join(' | ')}`);
  expect(titles[0] === 'Change daily calories from 2750 to 3000 kcal', `first should be the calorie change: ${titles[0]}`);
  expect(titles.some((t) => /Protect your training days/.test(t)), 'adherence suggestion missing');
  expect(titles.some((t) => t === 'Prioritise sleep and recovery this week'), 'recovery suggestion missing');
  const recovery = cards.filter({ hasText: 'Prioritise sleep' });
  await recovery.getByText(/Leg press: .* estimated 1-rep max −/).waitFor();
  await recovery.getByText(/Sleep 5\.5 h, soreness 3\.0\/5 over 3 check-ins/).waitFor();
  await recovery.getByText('The rule').click();
  await recovery.getByText(/Two or more lifts dropped while sleep averaged under 7 hours/).waitFor();
  step(`3 suggestions with evidence and rules: ${titles.join(' | ')}`);

  await page.getByText(/Leg press/).first().waitFor();
  await page.getByText(/Waist \(at navel\)/).first().waitFor();
  await page.getByText(/rising weight on its own doesn't show muscle gain/).waitFor();
  step('training, lift comparisons, measurements and weight caveat shown');

  // Decide
  await cards.filter({ hasText: 'Change daily calories' }).getByRole('button', { name: 'Accept' }).click();
  await cards.filter({ hasText: 'Protect your training days' }).getByRole('button', { name: 'Noted' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Previous week' }).click();
  await cards.filter({ hasText: 'Change daily calories' }).getByText('Accepted').waitFor();
  await cards.filter({ hasText: 'Protect your training days' }).getByText('Noted').waitFor();
  await page.getByText(/Decision history \(2\)/).click();
  await page.getByText(/Decided .*, for the week of/).first().waitFor();
  step('accepted the calorie change, noted the adherence step; both persist with a dated history');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });

  await page.goto(URL);
  await page.getByText(/Target 3,000 kcal/).waitFor();
  step('accepted change updated the calorie target to 3,000 kcal');

  // Optional check-in from Today
  await page.getByRole('button', { name: /Check-in/ }).click();
  await page.getByLabel('Hours of sleep last night').fill('7.5');
  await page.getByRole('group', { name: 'Energy' }).getByRole('button', { name: '4', exact: true }).click();
  await page.getByRole('button', { name: 'Save check-in' }).click();
  await page.reload();
  await page.getByText('Slept 7.5 h · energy 4/5').waitFor();
  step('optional check-in saved (soreness left blank) and survives a reload');

  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log('\nREVIEW CHECK PASSED');
} catch (e) {
  console.error('\nREVIEW CHECK FAILED:', e.message);
  await page.screenshot({ path: 'review-check-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
