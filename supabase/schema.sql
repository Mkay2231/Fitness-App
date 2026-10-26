-- Rep Ledger account storage. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run again: everything is created only if missing, or replaced.
--
-- One row per account holds that account's copy of the app data (the same contents as
-- Settings → Export full backup, minus the built-in foods). Row-level security means a
-- signed-in user can only ever read or write their own row; nobody signed out can read anything.

create table if not exists public.backups (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- Goes up by one on every upload. The app only overwrites the version it last saw,
  -- so two phones syncing at once can't silently undo each other.
  version    integer not null check (version > 0),
  -- SHA-256 of the data, so phones can tell "same data" without downloading it.
  hash       text not null,
  data       jsonb not null,
  -- Which kind of device uploaded last, e.g. "Android phone". Shown when you choose between copies.
  device     text,
  updated_at timestamptz not null default now()
);

alter table public.backups enable row level security;

-- Supabase no longer exposes new tables to the API automatically (from 30 October 2026),
-- so access is granted explicitly. Signed-out visitors (anon) get nothing.
revoke all on table public.backups from anon, authenticated;
grant select, insert, update, delete on table public.backups to authenticated;

drop policy if exists "Read own backup" on public.backups;
create policy "Read own backup" on public.backups
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Create own backup" on public.backups;
create policy "Create own backup" on public.backups
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own backup" on public.backups;
create policy "Update own backup" on public.backups
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own backup" on public.backups;
create policy "Delete own backup" on public.backups
  for delete to authenticated using ((select auth.uid()) = user_id);

-- The server sets the time, so a phone with a wrong clock can't confuse it.
create or replace function public.backups_touch() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists backups_touch on public.backups;
create trigger backups_touch before insert or update on public.backups
  for each row execute function public.backups_touch();

-- "Delete my account" in the app. Runs with owner rights because deleting a sign-in needs
-- them, but it can only ever delete the account of whoever calls it. The backup row goes
-- with it (on delete cascade).
create or replace function public.delete_my_account() returns void
  language sql security definer set search_path = '' as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
