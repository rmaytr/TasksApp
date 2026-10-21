-- Nearer: one end-to-end encrypted vault per user.
-- The server never sees task content: only ciphertext, the KDF salt/iteration count,
-- a version counter and a timestamp.

create table if not exists public.vaults (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  salt           text   not null check (length(salt) between 16 and 64),
  kdf_iterations integer not null check (kdf_iterations between 100000 and 10000000),
  iv             text   not null check (length(iv) between 12 and 32),
  ciphertext     text   not null check (length(ciphertext) <= 5000000),
  version        bigint not null default 1 check (version >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.vaults is 'End-to-end encrypted task data. One row per user; contents are AES-GCM ciphertext.';

-- Row Level Security: every statement is limited to the caller's own row.
alter table public.vaults enable row level security;
alter table public.vaults force row level security;

create policy "vaults: owner can read"
  on public.vaults for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "vaults: owner can create"
  on public.vaults for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "vaults: owner can update"
  on public.vaults for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "vaults: owner can delete"
  on public.vaults for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No access at all for signed-out (anon) requests.
revoke all on public.vaults from anon;
grant select, insert, update, delete on public.vaults to authenticated;

-- Writes must move the version forward by exactly one (optimistic concurrency, no rollbacks),
-- the owner can never change, and timestamps are set by the server.
create or replace function public.vaults_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
  else
    if new.user_id <> old.user_id then
      raise exception 'vault owner cannot change';
    end if;
    if new.version <> old.version + 1 then
      raise exception 'vault version must increase by one' using errcode = '40001';
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vaults_guard on public.vaults;
create trigger vaults_guard
  before insert or update on public.vaults
  for each row execute function public.vaults_guard();

-- Self-service account deletion (required by app stores, and simply right).
-- Deleting the auth user cascades to the vault row.
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
