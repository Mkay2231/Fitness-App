// End-to-end check of the meal plan in the installed Edge/Chrome: daily plan vs targets,
// one-tap logging and undo, swaps, food preferences, planning ahead, shopping list and cook-ahead.
//
//   npm run dev           (in one terminal)
//   npm run check:meals   (in another)

import { chromium } from 'playwright-core';
import { completeSetup } from './lib/setup.mjs';

const URL = process.env.APP_URL || 'http://localhost:5173/';
const step = (msg) => console.log(`✓ ${msg}`);
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const browser = await chromium.launch({ channel: process.env.BROWSER || 'msedge', headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const num = (s) => Number(String(s).replace(/[^\d.]/g, ''));

try {
  await page.goto(URL);
  await completeSetup(page);

  await page.goto(`${URL}#/food`);
  await page.getByRole('heading', { name: /^Planned for / }).waitFor();
  const cards = page.locator('section.meal-card');
  expect(await cards.count() >= 4, `expected at least 4 planned meals, got ${await cards.count()}`);
  const planned = num(await page.locator('.kpi .v').first().textContent());
  const target = num((await page.locator('.kpi .l').first().textContent()).match(/of ([\d,]+)/)[1]);
  expect(Math.abs(planned - target) / target < 0.1, `plan ${planned} kcal is not within 10% of target ${target}`);
  step(`daily plan: ${await cards.count()} meals, ${planned} kcal for a ${target} kcal target`);

  const breakfast = cards.first();
  const breakfastName = (await breakfast.locator('h3').textContent()).trim();
  await breakfast.getByText(/Ingredients \(\d+\), raw as bought/).click();
  await breakfast.locator('.ingredients li').first().waitFor();
  await breakfast.getByRole('button', { name: 'I ate this' }).click();
  await breakfast.getByText("Logged in today's food").waitFor();
  await page.getByRole('tab', { name: 'Log' }).click();
  await page.getByText(new RegExp(`${breakfastName.replace(/[()]/g, '.')} \\(`)).first().waitFor();
  await page.getByText('In progress', { exact: true }).waitFor();
  step(`"I ate this" logged ${breakfastName} into Breakfast in one tap`);

  await page.getByRole('tab', { name: 'Plan' }).click();
  await cards.first().getByRole('button', { name: 'Undo' }).click();
  await cards.first().getByRole('button', { name: 'I ate this' }).waitFor();
  await page.getByRole('tab', { name: 'Log' }).click();
  await page.getByText('Not logged', { exact: true }).waitFor();
  step('Undo removes the logged meal again');

  await page.getByRole('tab', { name: 'Plan' }).click();
  const lunch = cards.nth(1);
  const before = (await lunch.locator('h3').textContent()).trim();
  const swapSelect = lunch.locator('select');
  const other = (await swapSelect.locator('option').allTextContents()).find((o) => !o.startsWith('Swap') && o !== before);
  await swapSelect.selectOption({ label: other });
  await lunch.locator('h3', { hasText: other }).waitFor();
  await page.reload();
  await page.locator('section.meal-card').nth(1).locator('h3', { hasText: other }).waitFor();
  step(`swapped lunch from ${before} to ${other}, and it stays after a reload`);

  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByText('You can log this on the day.').first().waitFor();
  await page.getByRole('button', { name: 'Previous day' }).click();
  step('next days can be planned ahead but not logged early');

  await page.getByRole('button', { name: /Shopping list and cook-ahead/ }).click();
  await page.getByRole('heading', { name: 'Cook ahead' }).waitFor();
  await page.getByRole('heading', { name: 'Shopping list' }).waitFor();
  const rice = page.locator('.shop-list li', { hasText: 'Rice, white, raw' });
  expect(await rice.count() === 1, 'rice missing from the shopping list');
  await rice.locator('input').check();
  await page.reload();
  expect(await page.locator('.shop-list li', { hasText: 'Rice, white, raw' }).locator('input').isChecked(), 'ticked item not remembered');
  await page.getByText(/Cook on Sunday/).waitFor();
  step(`week prep: cook-ahead sessions and a shopping list (rice ${(await rice.locator('.num').textContent()).trim()}), ticks remembered`);

  await page.goto(`${URL}#/settings`);
  await page.getByRole('button', { name: 'Eggs', exact: true }).click();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByText('Profile saved.').waitFor();
  for (let d = 0; d < 7; d++) {
    await page.goto(`${URL}#/food?date=${await page.evaluate((n) => { const t = new Date(); t.setDate(t.getDate() + n); return t.toLocaleDateString('en-CA'); }, d)}`);
    await page.getByRole('heading', { name: /^Planned for / }).waitFor();
    const names = (await page.locator('section.meal-card h3').allTextContents()).join(' | ');
    expect(!/egg/i.test(names), `day +${d} still has an egg meal: ${names}`);
  }
  step('after choosing "no eggs", none of the next 7 days plans an egg meal');

  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log('\nMEALS CHECK PASSED');
} catch (e) {
  console.error('\nMEALS CHECK FAILED:', e.message);
  await page.screenshot({ path: 'meals-check-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
