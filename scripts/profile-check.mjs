// End-to-end check of setup, persistence across reloads, and profile editing,
// using the Edge or Chrome installed on this computer.
//
//   npm run dev            (in one terminal)
//   npm run check:profile  (in another; APP_URL=... to point elsewhere)

import { chromium } from 'playwright-core';

const URL = process.env.APP_URL || 'http://localhost:5173/';
const step = (msg) => console.log(`✓ ${msg}`);
const browser = await chromium.launch({ channel: process.env.BROWSER || 'msedge', headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const pressed = (name) => page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed');
const checked = (name) => page.getByRole('radio', { name }).getAttribute('aria-checked');
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

try {
  await page.goto(URL);
  await page.getByRole('heading', { name: 'Set up' }).waitFor();
  await page.getByRole('button', { name: 'Save and start' }).click();
  await page.getByText("Some answers need fixing; they're marked above.").waitFor();
  await page.getByText('Enter your age in years (14–90).').waitFor();
  step('empty setup is blocked with specific messages');

  await page.getByRole('radio', { name: /Lean gain/ }).click();
  await page.getByRole('button', { name: 'lb', exact: true }).click();
  await page.getByRole('button', { name: 'in', exact: true }).click();
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await page.getByLabel('Age').fill('25');
  await page.getByLabel('Height (in)').fill('69');
  await page.getByLabel('Weight (lb)').fill('137');
  await page.getByRole('radio', { name: /A year or more/ }).click();
  await page.getByRole('radio', { name: /^Home/ }).click();
  await page.getByRole('button', { name: '45 min', exact: true }).click();
  await page.getByRole('button', { name: 'Lower back', exact: true }).click();
  await page.getByRole('button', { name: 'Beef (incl. shaki, liver)', exact: true }).click();
  await page.getByRole('heading', { name: 'Your starting plan' }).waitFor();
  step('starting plan preview appears once answers are valid');
  await page.getByRole('button', { name: 'Save and start' }).click();
  await page.getByRole('heading', { name: 'Today' }).waitFor();
  step('setup saved');

  await page.reload();
  await page.getByRole('heading', { name: 'Today' }).waitFor();
  await page.goto(`${URL}#/settings`);
  await page.getByRole('heading', { name: 'Profile' }).waitFor();
  expect(await page.getByLabel('Age').inputValue() === '25', 'age not kept');
  expect(await page.getByLabel('Height (in)').inputValue() === '69', 'height not kept in inches');
  expect(await checked(/Lean gain/) === 'true', 'goal not kept');
  expect(await checked(/A year or more/) === 'true', 'experience not kept');
  expect(await pressed('45 min') === 'true', 'session length not kept');
  expect(await pressed('Lower back') === 'true', 'limitation not kept');
  expect(await pressed('Beef (incl. shaki, liver)') === 'true', 'food preference not kept');
  expect(await pressed('lb') === 'true', 'unit not kept');
  step('every answer survives a reload');

  await page.getByRole('button', { name: '30 min', exact: true }).click();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByRole('heading', { name: 'Review changes' }).waitFor();
  const changes = await page.locator('.review-changes li').allTextContents();
  expect(changes.length > 0, 'no program changes listed');
  step(`profile edit lists program changes first: ${changes[0]}`);
  await page.getByRole('button', { name: 'Update program' }).click();
  await page.getByText('Program updated.').waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Profile' }).waitFor();
  expect(await pressed('30 min') === 'true', 'edited session length not kept');
  step('edited profile survives a reload');

  await page.goto(`${URL}#/train`);
  await page.getByRole('heading', { name: 'Train' }).waitFor();
  const minutes = await page.locator('.session-panel .meta').first().textContent();
  expect(/about (2|3)\d min|about 30 min/.test(minutes), `session not fitted to 30 min: ${minutes}`);
  step(`program fitted to the shorter session (${minutes.trim()})`);

  await page.goto(URL);
  await page.getByLabel('Body weight').fill('137.5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('137.5 lb').waitFor();
  step('body weight entered and shown in lb');

  await page.getByRole('button', { name: /Start workout|Train today instead/ }).click();
  await page.waitForURL(/#\/workout\//);
  await page.getByText(/because of your lower back/).first().waitFor();
  await page.getByRole('columnheader', { name: /lb/ }).first().waitFor();
  step('workout explains the lower-back swap and uses lb');

  await page.goto(`${URL}#/food`);
  await page.getByRole('button', { name: /Add to breakfast/ }).click();
  await page.getByText(/Hiding \d+ foods? you don't eat/).waitFor();
  await page.getByLabel('Search foods').fill('shaki');
  await page.getByText(/No food matches "shaki"/).waitFor();
  step('foods you avoid are hidden from search');

  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log('\nPROFILE CHECK PASSED');
} catch (e) {
  console.error('\nPROFILE CHECK FAILED:', e.message);
  await page.screenshot({ path: 'profile-check-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
