// The Supabase connection. The URL and publishable key are public by design: row-level
// security in supabase/schema.sql is what keeps each account's copy private.
// With no keys set (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY), accounts are switched off
// and the app works exactly as before, on this phone only.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Snapshot } from './data';
import type { CloudMeta, Remote } from './sync';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

/** Where Google sign-in and email links come back to: the app's own start page. */
export const redirectTo = () => `${location.origin}${location.pathname}`;

interface Row { version: number; hash: string; updated_at: string; device: string | null; data?: Snapshot }

const toMeta = (r: Row): CloudMeta => ({ version: r.version, hash: r.hash, updatedAt: r.updated_at, device: r.device });

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}: ${error.message}`);
}

/** The signed-in account's copy, one row in the `backups` table. */
export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  const table = () => client.from('backups');
  return {
    async meta() {
      const { data, error } = await table().select('version, hash, updated_at, device').eq('user_id', userId).maybeSingle<Row>();
      if (error) fail('Couldn’t check your account', error);
      return data ? toMeta(data) : null;
    },
    async fetch() {
      const { data, error } = await table().select('version, hash, updated_at, device, data').eq('user_id', userId).maybeSingle<Row>();
      if (error) fail('Couldn’t download your account copy', error);
      return data?.data ? { meta: toMeta(data), data: data.data } : null;
    },
    async put(expected, data, hash, device) {
      const row = { hash, data, device };
      if (expected === null) {
        const { data: out, error } = await table().insert({ user_id: userId, version: 1, ...row }).select('version, hash, updated_at, device').maybeSingle<Row>();
        // 23505 = the row already exists: another device uploaded first.
        if (error?.code === '23505') return null;
        if (error) fail('Couldn’t upload to your account', error);
        return out ? toMeta(out) : null;
      }
      // Only overwrite the version we compared against, so a newer upload from another device is never lost.
      const { data: out, error } = await table().update({ version: expected + 1, ...row }).eq('user_id', userId).eq('version', expected)
        .select('version, hash, updated_at, device').maybeSingle<Row>();
      if (error) fail('Couldn’t upload to your account', error);
      return out ? toMeta(out) : null;
    },
  };
}

/** Plain-language versions of the sign-in errors people actually hit. */
export function authMessage(error: { message?: string; code?: string; status?: number }): string {
  const m = error.message ?? '';
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(m)) return 'That email and password don’t match an account.';
  if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (error.code === 'user_already_exists' || /already registered/i.test(m)) return 'There’s already an account with this email. Sign in instead.';
  if (error.code === 'weak_password' || /password should/i.test(m)) return m || 'Choose a longer password.';
  if (error.status === 429 || /rate limit|too many/i.test(m)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'Google sign-in isn’t switched on for this app yet. Use email and password for now.';
  if (/failed to fetch|network|load failed/i.test(m)) return 'Couldn’t reach the account service. Check your internet connection and try again.';
  return m || 'Something went wrong. Try again.';
}
