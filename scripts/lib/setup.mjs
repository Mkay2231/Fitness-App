// Shared by the browser checks: goes through the welcome screens and step-by-step setup.

/**
 * @param {import('playwright-core').Page} page
 * @param {{ goal?: RegExp, lb?: boolean, inches?: boolean, sex?: string, age?: string, height?: string, weight?: string,
 *   experience?: RegExp, setting?: RegExp, minutes?: string, limitations?: string[], avoid?: string[],
 *   beforeSave?: () => Promise<void>, keepTips?: boolean }} o
 */
export async function completeSetup(page, o = {}) {
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const step = (name) => page.getByRole('heading', { name, exact: true }).waitFor();

  await step('Your training journal');
  await btn('Skip').click();

  await step('What do you want?');
  if (o.goal) await page.getByRole('radio', { name: o.goal }).click();
  await btn('Continue').click();

  await step('A little about you');
  if (o.lb) await btn('lb').click();
  if (o.inches) await btn('in').click();
  await btn(o.sex ?? 'Male').click();
  await page.getByLabel('Age').fill(o.age ?? '25');
  await page.getByLabel(/^Height/).fill(o.height ?? '175');
  await page.getByLabel(/^Weight \(/).fill(o.weight ?? '62');
  await btn('Continue').click();

  await step('How you train');
  if (o.experience) await page.getByRole('radio', { name: o.experience }).click();
  if (o.setting) await page.getByRole('radio', { name: o.setting }).click();
  if (o.minutes) await btn(o.minutes).click();
  for (const l of o.limitations ?? []) await btn(l).click();
  await btn('Continue').click();

  await step('What you eat');
  for (const a of o.avoid ?? []) await btn(a).click();
  await btn('Continue').click();

  await step('Your starting plan');
  if (o.beforeSave) await o.beforeSave();
  await btn('Start using Rep Ledger').click();
  await page.getByRole('heading', { name: 'Today' }).waitFor();

  if (!o.keepTips) {
    // Dismiss every first-visit guide so later steps see the screens as a returning user would.
    await page.evaluate(() => ['today', 'train', 'workout', 'food', 'progress', 'review'].forEach((id) => localStorage.setItem(`rl-tip-${id}`, 'seen')));
    await page.reload();
    await page.getByRole('heading', { name: 'Today' }).waitFor();
  }
}
