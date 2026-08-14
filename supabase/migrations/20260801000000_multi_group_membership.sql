-- Multi-group membership: a player may belong to several groups at once.
-- Replaces the single profiles.group_id pointer with a group_members join
-- table (profiles.group_id is kept as a "primary/last-joined" convenience and
-- is no longer the source of truth). Additive + backfilled; safe to apply.
begin;

create table if not exists public.group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists group_members_user_idx  on public.group_members(user_id);
create index if not exists group_members_group_idx on public.group_members(group_id);

-- Backfill existing single memberships.
insert into public.group_members (group_id, user_id)
select group_id, id from public.profiles where group_id is not null
on conflict (group_id, user_id) do nothing;

alter table public.group_members enable row level security;

drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members
  for select using (auth.role() = 'authenticated');

-- No write policies: membership changes go through server actions (service role).

commit;
