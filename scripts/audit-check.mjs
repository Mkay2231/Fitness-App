// Audit at a narrow 360 px phone width: horizontal overflow, touch-target size,
// unlabelled controls, and keyboard-only logging. Uses the installed Edge/Chrome.
//
//   npm run dev           (in one terminal)
//   npm run check:audit   (in another)

import { chromium } from 'playwright-core';

const URL = process.env.APP_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ channel: process.env.BROWSER || 'msedge', headless: true });
const page = await (await browser.newContext({ viewport: { width: 360, height: 740 }, reducedMotion: 'reduce' })).newPage();
const problems = [];
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());

async function inspect(label) {
  const r = await page.evaluate(() => {
    const out = { overflow: 0, small: [], unlabelled: [] };
    out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, summary, [role="radio"]')) {
      // A checkbox inside a label is tapped through the whole label, so that's the target to measure.
      const target = el.type === 'checkbox' && el.closest('label') ? el.closest('label') : el;
      const rect = target.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || style.visibility === 'hidden' || el.closest('[hidden]')) continue;
      if (el.type === 'file' || el.type === 'hidden') continue;
      const name = (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent || el.getAttribute('placeholder') || '').trim();
      // Inline text links inside sentences are exempt from the 44 px rule (WCAG 2.5.8 inline exception).
      const inline = el.tagName === 'A' && style.display === 'inline';
      if (!inline && (rect.height < 43.5 || rect.width < 43.5)) out.small.push(`${el.tagName.toLowerCase()} "${name.slice(0, 30)}" ${Math.round(rect.width)}×${Math.round(rect.height)}`);
      const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.labels?.length || el.textContent.trim() || el.closest('label');
      if (!labelled) out.unlabelled.push(`${el.tagName.toLowerCase()}#${el.id || '?'}`);
    }
    return out;
  });
  if (r.overflow > 0) problems.push(`${label}: page scrolls sideways by ${r.overflow}px`);
  for (const s of r.small) problems.push(`${label}: small target ${s}`);
  for (const u of r.unlabelled) problems.push(`${label}: unlabelled control ${u}`);
  console.log(`${r.overflow > 0 || r.small.length || r.unlabelled.length ? '✗' : '✓'} ${label}`);
}

try {
  await page.goto(URL);
  const press = async (name, key = 'Enter') => { await page.getByRole('button', { name, exact: true }).focus(); await page.keyboard.press(key); };
  const heading = (name) => page.getByRole('heading', { name, exact: true }).waitFor();

  // Welcome screens, keyboard only.
  for (const [title, next] of [['Your training journal', 'Next'], ['How it works', 'Next'], ['You stay in control', 'Set up my plan']]) {
    await heading(title);
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    if (focused !== 'H1') problems.push(`Welcome "${title}": focus not moved to the heading (on ${focused})`);
    await inspect(`Welcome: ${title}`);
    await press(next);
  }

  // Setup, keyboard only: arrow keys in option lists, Space on chips, typing, Enter to continue.
  await heading('What do you want?');
  await inspect('Setup 1: goal');
  await page.getByRole('radio', { name: /Steady gain/ }).focus();
  await page.keyboard.press('ArrowDown');
  if (await page.getByRole('radio', { name: /Faster gain/ }).getAttribute('aria-checked') !== 'true') problems.push('Goal: ArrowDown did not select the next option');
  await page.keyboard.press('ArrowUp');
  await press('Continue');
  await heading('A little about you');
  await inspect('Setup 2: about you');
  await press('Male', 'Space');
  await page.getByLabel('Age').focus();
  await page.keyboard.type('25');
  await page.keyboard.press('Tab');
  await page.keyboard.type('175');
  await page.keyboard.press('Tab');
  await page.keyboard.type('62');
  await page.keyboard.press('Enter');
  await heading('How you train');
  await inspect('Setup 3: training');
  await press('Continue');
  await heading('What you eat');
  await inspect('Setup 4: food');
  await press('Continue');
  await heading('Your starting plan');
  await inspect('Setup 5: plan');
  await press('Start using Rep Ledger');
  await page.getByRole('heading', { name: 'Today' }).waitFor();
  console.log('✓ keyboard-only welcome and setup (arrows in option lists, Space on choices, Enter to continue)');
  await inspect('Today (with guide)');
  await page.goto(`${URL}#/help`);
  await heading('Help');
  await inspect('Help');

  for (const [route, heading, label] of [['train', 'Train'], ['food', 'Food', 'Food plan'], ['food?view=prep', 'Food', 'Food week prep'], ['food?view=log', 'Food', 'Food log'], ['progress', 'Progress'], ['review', 'Review'], ['settings', 'Settings'], ['train/edit', 'Edit programme']]) {
    await page.goto(`${URL}#/${route}`);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    // Measure the loaded screen, not the loading placeholder.
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    await inspect(label ?? heading);
  }

  // Keyboard-only set logging: focus the weight box, type, Tab to reps, Enter.
  await page.goto(URL);
  await page.getByRole('button', { name: /Start workout|Train today instead/ }).click();
  await page.waitForURL(/#\/workout\//);
  const weight = page.getByRole('textbox', { name: /Set 1 weight/ }).first();
  await weight.focus();
  await page.keyboard.type('40');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('10');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Edit set 1: 40 by 10/ }).first().waitFor();
  console.log('✓ keyboard-only set logging (type weight, Tab, type reps, Enter)');
  await inspect('Workout');

  // Swap sheet: focus moves in, Escape closes and returns focus.
  const swapBtn = page.getByRole('button', { name: 'Swap exercise' }).nth(1);
  await swapBtn.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  const inDialog = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  if (!inDialog) problems.push('Swap sheet: focus did not move into the dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  const back = await page.evaluate(() => document.activeElement?.textContent?.trim());
  if (back !== 'Swap exercise') problems.push(`Swap sheet: focus returned to "${back}" instead of the Swap button`);
  console.log(`${inDialog && back === 'Swap exercise' ? '✓' : '✗'} dialog focus moves in and returns on Escape`);

  // Data controls: export, failed restore, delete everything.
  await page.goto(`${URL}#/settings`);
  await page.getByRole('heading', { name: 'Your data' }).waitFor();
  const [backup] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export full backup (JSON)' }).click()]);
  const backupJson = JSON.parse(await (await import('node:fs/promises')).readFile(await backup.path(), 'utf8'));
  if (backupJson.app !== 'rep-ledger' || !backupJson.data.sets?.length) problems.push('JSON backup missing app marker or logged sets');
  await page.getByText('Export for a spreadsheet (CSV)').click();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Workout sets' }).click()]);
  const csvText = await (await import('node:fs/promises')).readFile(await csv.path(), 'utf8');
  if (!csvText.startsWith('date,session_finished,exercise,set,weight_kg,reps,reps_in_reserve')) problems.push(`CSV header wrong: ${csvText.slice(0, 80)}`);
  console.log('✓ JSON backup and CSV export download with real records');

  await page.locator('input[type="file"]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('not json at all') });
  await page.getByText(/Restore failed: This file isn't a readable backup .* Nothing was changed\./).waitFor();
  await page.goto(URL);
  await page.getByRole('link', { name: 'Resume workout' }).waitFor();
  console.log('✓ a broken backup file is refused with a clear message and existing data is untouched');

  await page.goto(`${URL}#/settings`);
  await page.getByText('Delete all data', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete everything on this device' }).click();
  await page.getByRole('heading', { name: 'Your training journal' }).waitFor();
  const leftovers = await page.evaluate(() => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k) => k?.startsWith('rl-')));
  if (leftovers.length) problems.push(`delete left drafts behind: ${leftovers.join(', ')}`);
  console.log(`${leftovers.length ? '✗' : '✓'} delete-all returns to the welcome screens and leaves no drafts or dismissed guides`);

  if (errors.length) problems.push(`page errors: ${errors.join('; ')}`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nAUDIT CHECK PASSED');
  }
} catch (e) {
  console.error('\nAUDIT CHECK FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
