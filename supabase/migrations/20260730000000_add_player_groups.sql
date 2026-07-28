-- Player groups: self-serve, persist across seasons. Scope is leaderboard
-- ranking only — group members still share the same balance, bets board,
-- and matches; only the leaderboard filters/ranks within a group.
begin;

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

alter table public.profiles
  add column if not exists group_id uuid references public.groups(id) on delete set null;

create index if not exists profiles_group_id_idx on public.profiles(group_id);

alter table public.groups enable row level security;

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups
  for select using (auth.role() = 'authenticated');

-- No insert/update/delete policies: group creation and membership changes go
-- through server actions using the service role.

commit;
