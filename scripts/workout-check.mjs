// End-to-end check of the workout flow in the Edge or Chrome installed on this computer:
// complete session, set edits, optional effort, interruption and resume, substitution,
// instructions state, progression after finishing, and programme editing.
//
//   npm run dev            (in one terminal)
//   npm run check:workout  (in another)

import { chromium } from 'playwright-core';

const URL = process.env.APP_URL || 'http://localhost:5173/';
const step = (msg) => console.log(`✓ ${msg}`);
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const browser = await chromium.launch({ channel: process.env.BROWSER || 'msedge', headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
const ex = (name) => page.locator('section.ex').filter({ has: page.getByRole('heading', { name, exact: true }) });
// The rest timer appears just after a set is saved; wait for it before skipping, or it can
// appear a moment later and cover the Finish button.
async function skipRest() {
  try {
    await page.getByRole('timer', { name: 'Rest timer' }).waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
  } catch { /* no rest running */ }
}

try {
  // Setup
  await page.goto(URL);
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await page.getByLabel('Age').fill('25');
  await page.getByLabel('Height (cm)').fill('175');
  await page.getByLabel('Weight (kg)').fill('62');
  await page.getByRole('radio', { name: /Some experience/ }).click();
  await page.getByRole('button', { name: 'Save and start' }).click();
  await page.getByRole('heading', { name: 'Today' }).waitFor();

  // Start session A
  await page.getByRole('button', { name: /Start workout|Train today instead/ }).click();
  await page.waitForURL(/#\/workout\//);
  const workoutUrl = page.url();
  const lp = ex('Leg press');
  await lp.getByText('Find your weight').waitFor({ timeout: 5000 });
  expect(await lp.getByRole('textbox', { name: /Set 1 weight/ }).inputValue() === '', 'weight input should start empty');
  step('no starting weight is invented for a first-time exercise');

  await lp.getByRole('textbox', { name: /Set 1 weight/ }).fill('40');
  await lp.getByRole('textbox', { name: /Set 1 reps/ }).fill('12');
  await lp.getByRole('button', { name: '2', exact: true }).click();
  await lp.getByRole('button', { name: 'Log set 1' }).click();
  await page.getByRole('timer', { name: 'Rest timer' }).waitFor();
  await lp.getByRole('button', { name: 'Log set 2' }).click();
  // Effort is optional: clear it for set 3.
  await lp.getByRole('button', { name: '2', exact: true }).click();
  await lp.getByRole('button', { name: 'Log set 3' }).click();
  await lp.getByRole('button', { name: /Edit set 3: 40 by 12/ }).waitFor();
  expect(await lp.getByText('RIR –').count() === 1, 'set 3 should have no RIR recorded');
  step('logged 3 sets (weight, reps, optional RIR) and the rest timer started');

  // Edit and correct
  await lp.getByRole('button', { name: /Edit set 2/ }).click();
  await lp.getByRole('textbox', { name: 'Set 2 reps' }).fill('11');
  await lp.getByRole('button', { name: 'Save changes to set 2' }).click();
  await lp.getByRole('button', { name: /Edit set 2: 40 by 11/ }).waitFor();
  await lp.getByRole('button', { name: /Edit set 2/ }).click();
  await lp.getByRole('textbox', { name: 'Set 2 reps' }).fill('12');
  await lp.getByRole('button', { name: 'Save changes to set 2' }).click();
  await lp.getByRole('button', { name: /Edit set 2: 40 by 12/ }).waitFor();
  step('edited a logged set and corrected it back');

  await lp.getByRole('button', { name: 'Add a set' }).click();
  await lp.getByRole('button', { name: 'Log set 4' }).click();
  await lp.getByRole('button', { name: /Edit set 4/ }).click();
  await lp.getByRole('button', { name: 'Delete set' }).click();
  await lp.getByText('3/3').waitFor();
  expect(await lp.getByRole('button', { name: /Edit set 4/ }).count() === 0, 'set 4 should be deleted');
  step('added an extra set and deleted it');

  // Interrupt and resume
  await page.reload();
  await ex('Leg press').getByRole('button', { name: /Edit set 3: 40 by 12/ }).waitFor();
  await page.getByRole('timer', { name: 'Rest timer' }).waitFor();
  await page.goto(URL);
  await page.getByRole('link', { name: 'Resume workout' }).click();
  await page.waitForURL(workoutUrl);
  await ex('Leg press').getByText('3/3').waitFor();
  step('after a reload the sets and running rest timer are kept, and Today offers Resume');

  // Instructions are not invented
  await ex('Lat pulldown').getByText('How to do it').click();
  await ex('Lat pulldown').getByText(/No verified instructions for this exercise/).waitFor();
  step('instructions show as unavailable instead of unsourced tips');

  // Substitution for today only
  await ex('Dumbbell bench press').getByRole('button', { name: 'Swap exercise' }).click();
  await page.getByRole('radio', { name: /Machine chest press/ }).click();
  await page.getByRole('button', { name: 'Swap for today only' }).click();
  const mcp = ex('Machine chest press');
  await mcp.getByText('Swapped today for Dumbbell bench press').waitFor();
  await mcp.getByRole('textbox', { name: /Set 1 weight/ }).fill('30');
  await mcp.getByRole('textbox', { name: /Set 1 reps/ }).fill('10');
  await mcp.getByRole('button', { name: 'Log set 1' }).click();
  await mcp.getByRole('button', { name: /Edit set 1: 30 by 10/ }).waitFor();
  step('swapped bench press for machine chest press today and logged a set');

  // Finish
  await skipRest();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('heading', { name: 'Today' }).waitFor();
  await page.getByText(/done$/).first().waitFor();
  step('finished the session (with unlogged sets confirmed)');

  // Session B, so the rotation returns to A
  await page.goto(`${URL}#/train`);
  await page.getByRole('button', { name: 'Start Full body B' }).click();
  await page.waitForURL(/#\/workout\//);
  const gs = ex('Goblet squat');
  await gs.getByRole('textbox', { name: /Set 1 weight/ }).fill('12');
  await gs.getByRole('button', { name: 'Log set 1' }).click();
  await skipRest();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('heading', { name: 'Today' }).waitFor();

  // Progression for A
  await page.goto(`${URL}#/train`);
  await page.getByRole('heading', { name: 'Next: Full body A' }).waitFor();
  const lpRow = await page.locator('.plan li').filter({ hasText: 'Leg press' }).textContent();
  expect(lpRow.includes('45 kg × 8'), `leg press should progress to 45 kg × 8 (machine jump 5 kg), got: ${lpRow}`);
  expect(lpRow.includes('Last 40 kg × 12, 12, 12'), `last performance missing: ${lpRow}`);
  const benchRow = await page.locator('.plan li').filter({ hasText: 'Dumbbell bench press' }).textContent();
  expect(benchRow.includes('New'), `bench press should still be first-time after a one-day swap: ${benchRow}`);
  step('next A: leg press 40 kg × 12,12,12 → 45 kg × 8; swapped-out bench press keeps no false history');

  // Programme editor
  await page.getByRole('link', { name: 'Edit programme' }).click();
  await page.getByRole('heading', { name: 'Edit programme' }).waitFor();
  await page.locator('#day-name-A').fill('Legs and push');
  await page.locator('#sets-A-0').fill('4');
  await page.locator('#add-A').selectOption({ label: 'Dumbbell hammer curl' });
  await page.getByRole('button', { name: 'Save programme' }).click();
  await page.getByRole('heading', { name: 'Next: Legs and push' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Next: Legs and push' }).waitFor();
  const lpEdited = await page.locator('.plan li').filter({ hasText: 'Leg press' }).textContent();
  expect(lpEdited.includes('4 × 8–12'), `edited sets not saved: ${lpEdited}`);
  expect(await page.locator('.plan li').filter({ hasText: 'Dumbbell hammer curl' }).count() === 1, 'added exercise missing');
  step('edited the programme (renamed, 4 sets, added an exercise) and it survived a reload');

  await page.getByRole('link', { name: 'Edit programme' }).click();
  await page.locator('#min-A-0').fill('14');
  await page.getByRole('button', { name: 'Save programme' }).click();
  await page.getByText('Fix these to save').waitFor();
  await page.getByText(/rep range must be whole numbers/).waitFor();
  step('invalid programme edits are refused with a specific message');

  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log('\nWORKOUT CHECK PASSED');
} catch (e) {
  console.error('\nWORKOUT CHECK FAILED:', e.message);
  await page.screenshot({ path: 'workout-check-failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
