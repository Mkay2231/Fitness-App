// End-to-end offline check against the production build, using the Edge or Chrome
// already installed on this computer (no browser download).
//
//   npm run build && npm run preview     (in one terminal)
//   npm run check:offline                (in another)
//
// Loads the app once online, then cuts the network and checks that the app
// still opens, that setup and a logged set save, and that they survive a reload.

import { chromium } from 'playwright-core';

const URL = process.env.APP_URL || 'http://localhost:4173/';
const channel = process.env.BROWSER || 'msedge';

const step = (msg) => console.log(`✓ ${msg}`);
const browser = await chromium.launch({ channel, headless: true });
const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await context.newPage();

try {
  await page.goto(URL);
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 30_000 })
    .catch(async () => { await page.reload(); await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15_000 }); });
  step('service worker installed and controlling the page');

  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'Set up' }).waitFor({ timeout: 10_000 });
  step('app opens with no network');

  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await page.getByLabel('Age').fill('25');
  await page.getByLabel('Height (cm)').fill('175');
  await page.getByRole('button', { name: 'Save and start' }).click();
  await page.getByRole('button', { name: /Start workout|Train anyway/ }).click();
  step('setup saved offline and workout started');

  await page.waitForURL(/#\/workout\//);
  await page.getByRole('textbox', { name: 'Weight', exact: true }).first().fill('40');
  await page.getByRole('button', { name: 'Log set 1' }).first().click();
  await page.getByText('40 kg × 8').first().waitFor({ timeout: 5_000 });
  step('set logged offline');

  await page.reload();
  await page.getByText('40 kg × 8').first().waitFor({ timeout: 10_000 });
  await page.getByText('Offline. Everything you log is saved on this phone.').waitFor({ timeout: 5_000 });
  step('logged set still there after an offline reload, offline banner shown');

  console.log('\nOFFLINE CHECK PASSED');
} catch (e) {
  console.error('\nOFFLINE CHECK FAILED:', e.message);
  await page.screenshot({ path: 'offline-check-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
