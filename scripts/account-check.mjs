// End-to-end check of sign-up, sign-in, sync between two phones, conflicts, sign-out and
// account deletion. Supabase is replaced by a small fake inside this script (at the
// never-resolving address http://supabase.test), so no account details leave this computer.
// Starts its own dev server with accounts switched on, so nothing else needs to be running.
//
//   npm run check:account

import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { completeSetup } from './lib/setup.mjs';

const SUPABASE = 'http://supabase.test';
process.env.VITE_SUPABASE_URL = SUPABASE;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fake_for_checks';

const PORT = 5181;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const URL = `http://localhost:${PORT}/`;

// ---------- Fake Supabase: auth plus one `backups` table ----------

const users = new Map(); // email -> { id, email, password }
let backup = null; // { user_id, version, hash, data, device, updated_at }
const calls = [];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (u) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.fake`;
const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [{ provider: 'email' }], created_at: '2026-10-26T00:00:00Z' });
const session = (u) => ({ access_token: jwt(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `refresh-${u.id}`, user: userJson(u) });
const caller = (headers) => {
  const token = (headers.authorization ?? '').replace(/^Bearer /, '');
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub; } catch { return null; }
};

async function fakeSupabase(route) {
  const req = route.request();
  const url = new globalThis.URL(req.url());
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  const json = (status, data) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: data === undefined ? '' : JSON.stringify(data) });
  const path = url.pathname;
  calls.push(`${req.method()} ${path}`);
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

  if (path === '/auth/v1/signup') {
    if (users.has(body.email)) return json(422, { code: 'user_already_exists', msg: 'User already registered' });
    const u = { id: crypto.randomUUID(), email: body.email, password: body.password };
    users.set(u.email, u);
    return json(200, session(u));
  }
  if (path === '/auth/v1/token') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const u = users.get(body.email);
      if (!u || u.password !== body.password) return json(400, { code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      return json(200, session(u));
    }
    if (grant === 'refresh_token') {
      const u = [...users.values()].find((x) => `refresh-${x.id}` === body.refresh_token);
      return u ? json(200, session(u)) : json(400, { code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    }
  }
  if (path === '/auth/v1/user') {
    const u = [...users.values()].find((x) => x.id === caller(req.headers()));
    return u ? json(200, userJson(u)) : json(401, { msg: 'Unauthorized' });
  }
  if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });

  if (path === '/rest/v1/backups') {
    const uid = caller(req.headers());
    if (!uid) return json(401, { message: 'not signed in' });
    const mine = backup && backup.user_id === uid ? [backup] : [];
    const pick = (rows) => rows.map((r) => Object.fromEntries((url.searchParams.get('select') ?? '*').split(',').map((k) => k.trim()).map((k) => [k, r[k]])));
    const eq = (k) => url.searchParams.get(k)?.replace(/^eq\./, '');
    if (req.method() === 'GET') return json(200, pick(mine.filter((r) => r.user_id === eq('user_id'))));
    if (req.method() === 'POST') {
      if (body.user_id !== uid) return json(403, { code: '42501', message: 'row-level security' });
      if (backup?.user_id === uid) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "backups_pkey"' });
      backup = { ...body, updated_at: new Date().toISOString() };
      return json(201, pick([backup]));
    }
    if (req.method() === 'PATCH') {
      const hit = mine.filter((r) => r.user_id === eq('user_id') && String(r.version) === eq('version'));
      if (hit.length) backup = { ...backup, ...body, updated_at: new Date().toISOString() };
      return json(200, pick(hit.length ? [backup] : []));
    }
  }
  if (path === '/rest/v1/rpc/delete_my_account') {
    const uid = caller(req.headers());
    for (const [email, u] of users) if (u.id === uid) users.delete(email);
    if (backup?.user_id === uid) backup = null;
    return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  }
  return json(404, { message: `fake Supabase has no ${req.method()} ${path}` });
}

// ---------- The check ----------

const step = (msg) => console.log(`✓ ${msg}`);
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const browser = await chromium.launch({ channel: process.env.BROWSER || 'msedge', headless: true });
const errors = [];

async function phone(name) {
  const context = await browser.newContext({ viewport: { width: 360, height: 760 } });
  await context.route(`${SUPABASE}/**`, fakeSupabase);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return page;
}

const EMAIL = 'check@example.test';
const PASSWORD = 'correct-horse-battery';
// SHOTS=<folder> saves screenshots of the account screens for a design look.
const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: `${process.env.SHOTS}/account-${name}.png`, fullPage: true });
const synced = (page) => page.getByText(/^Synced/).first().waitFor({ timeout: 20000 });

async function logWeight(page, value) {
  await page.goto(`${URL}#/`);
  await page.getByLabel('Body weight').fill(value);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText(`${value} kg`).first().waitFor();
}

// Today takes one weigh-in a day, so later changes are earlier days written straight to the
// app's own database (the dev server serves its source, so this is the same module the app uses).
const addWeight = (page, date, kg) => page.evaluate(async ([d, k]) => (await import('/src/db.ts')).db.weights.put({ date: d, kg: k }), [date, kg]);
const weights = (page) => page.evaluate(async () => (await (await import('/src/db.ts')).db.weights.toArray()).map((w) => w.kg));

try {
  // Phone A: set up, then create an account from Settings.
  const a = await phone('A');
  await a.goto(URL);
  await completeSetup(a);
  await logWeight(a, '62.5');
  await a.goto(`${URL}#/settings`);
  await a.getByRole('heading', { name: 'Account and sync' }).waitFor();
  await a.getByRole('link', { name: 'Sign in or create an account' }).click();
  await a.getByRole('heading', { name: 'Account', exact: true }).waitFor();
  await a.getByRole('tab', { name: 'New account' }).click();
  await a.getByLabel('Email').fill(EMAIL);
  await a.getByLabel('Password', { exact: true }).fill('short');
  await a.getByRole('button', { name: 'Create account', exact: true }).click();
  await a.getByText('Use at least 8 characters for your password.').waitFor();
  await shot(a, 'create');
  await a.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await a.getByRole('button', { name: 'Create account', exact: true }).click();
  await a.getByRole('heading', { name: EMAIL }).waitFor();
  await synced(a);
  await shot(a, 'signed-in');
  expect(backup?.version === 1 && backup.data.data.settings.length === 1, `phone A's data not uploaded: ${JSON.stringify(backup && { v: backup.version })}`);
  expect(!backup.data.data.foods.some((f) => f.builtIn), 'built-in foods were uploaded');
  expect(backup.data.data.weights.some((w) => w.kg === 62.5), 'weigh-in not in the account copy');
  step('create account (short password refused), and the phone’s data is copied to the account');

  // Phone B: a new phone restores from the welcome screen.
  const b = await phone('B');
  await b.goto(URL);
  await b.getByRole('heading', { name: 'Your training journal' }).waitFor();
  await b.getByRole('link', { name: 'Sign in to restore your data' }).click();
  await b.getByRole('link', { name: 'Back to setup' }).waitFor();
  await b.getByLabel('Email').fill(EMAIL);
  await b.getByLabel('Password', { exact: true }).fill('wrong-password');
  await b.getByRole('button', { name: 'Sign in', exact: true }).click();
  await b.getByText('That email and password don’t match an account.').waitFor();
  await shot(b, 'restore');
  await b.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await b.getByRole('button', { name: 'Sign in', exact: true }).click();
  await synced(b);
  await b.goto(`${URL}#/`);
  await b.getByRole('heading', { name: 'Today' }).waitFor();
  await b.getByText('62.5 kg').first().waitFor();
  expect(backup.version === 1, 'restoring phone B uploaded again');
  step('a new phone signs in from the welcome screen (wrong password explained) and gets the same data');

  // Changes flow from B to A, with no button pressed on B.
  await addWeight(b, '2026-10-01', 62.8);
  for (let i = 0; i < 40 && backup.version < 2; i++) await b.waitForTimeout(250);
  expect(backup.version === 2, 'phone B’s new weigh-in was not uploaded within 10 s');
  await a.goto(`${URL}#/account`);
  await a.getByRole('button', { name: 'Sync now' }).click();
  await synced(a);
  expect((await weights(a)).includes(62.8), 'phone A did not receive phone B’s weigh-in');
  step('a change on one phone uploads by itself and reaches the other phone');

  // Both change before syncing: the app asks instead of overwriting.
  await a.goto(`${URL}#/`);
  await a.getByRole('heading', { name: 'Today' }).waitFor();
  await a.context().setOffline(true);
  await addWeight(a, '2026-10-02', 63.1);
  await addWeight(b, '2026-10-03', 63.4);
  for (let i = 0; i < 40 && backup.version < 3; i++) await b.waitForTimeout(250);
  expect(backup.version === 3, 'phone B’s change was not uploaded');
  await a.context().setOffline(false);
  await a.goto(`${URL}#/`);
  await a.getByRole('link', { name: 'Choose which to keep' }).click({ timeout: 20000 });
  await a.getByRole('heading', { name: 'Choose which copy to keep' }).waitFor();
  await a.getByText(/Updated .* \(Windows computer\)/).waitFor();
  expect(backup.version === 3, 'the account copy changed before a choice was made');
  await shot(a, 'conflict');
  await a.getByRole('button', { name: 'Keep this phone’s data' }).click();
  await synced(a);
  expect(backup.version === 4 && backup.data.data.weights.some((w) => w.kg === 63.1) && !backup.data.data.weights.some((w) => w.kg === 63.4), 'keeping phone A did not replace the account copy');
  step('when both phones changed, sync pauses and asks; the kept copy replaces the other');

  // Sign out on B keeps its data; deleting the account on A removes the account copy.
  await b.goto(`${URL}#/account`);
  await b.getByRole('button', { name: 'Sign out', exact: true }).click();
  await b.getByRole('tab', { name: 'Sign in' }).waitFor();
  await b.goto(`${URL}#/`);
  await b.getByRole('heading', { name: 'Today' }).waitFor();
  step('signing out keeps the data on that phone');

  await a.goto(`${URL}#/account`);
  await a.getByText('Delete account').click();
  await a.getByRole('button', { name: 'Delete my account' }).click();
  await a.getByRole('tab', { name: 'Sign in' }).waitFor();
  expect(backup === null && !users.has(EMAIL), 'account or its copy still exists after deleting');
  await a.goto(`${URL}#/`);
  await a.getByRole('heading', { name: 'Today' }).waitFor();
  step('deleting the account removes it and its copy; the phone keeps its data');

  const overflow = await a.evaluate(async () => {
    location.hash = '#/account';
    await new Promise((r) => setTimeout(r, 300));
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });
  expect(overflow <= 0, `account screen scrolls sideways by ${overflow}px at 360 px`);
  step('account screen fits a 360 px phone');

  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log('\nACCOUNT CHECK PASSED');
} catch (e) {
  console.error('\nACCOUNT CHECK FAILED:', e.message);
  console.error('last calls:', calls.slice(-8).join(' | '));
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
