-- ============================================================
-- World Cup Bets App - Initial Schema
-- ============================================================

-- Profiles: extends auth.users
create table if not exists public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  display_name    text not null,
  starting_fund   numeric not null default 500,
  current_balance numeric not null default 500,
  role            text not null default 'player' check (role in ('player', 'admin')),
  created_at      timestamptz not null default now()
);

-- Matches: synced from football API
create table if not exists public.matches (
  id                 uuid primary key default gen_random_uuid(),
  external_match_id  text unique not null,
  home_team          text not null,
  away_team          text not null,
  kickoff_time       timestamptz not null,
  stage              text,
  group_name         text,
  status             text not null default 'SCHEDULED',
  score_home         int,
  score_away         int,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Bets: user wagers
create table if not exists public.bets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  match_id        uuid not null references public.matches(id),
  bet_type        text not null,
  selection       text not null,
  odds            numeric not null check (odds > 1),
  stake           numeric not null check (stake > 0),
  possible_return numeric not null,
  payout          numeric not null default 0,
  status          text not null default 'pending' check (status in ('pending', 'won', 'lost', 'void')),
  settled_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- Transactions: balance history
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  bet_id       uuid references public.bets(id),
  type         text not null check (type in ('initial_fund', 'stake_deduct', 'payout', 'refund', 'adjustment')),
  amount       numeric not null,
  balance_after numeric not null,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists bets_user_id_idx on public.bets(user_id);
create index if not exists bets_match_id_idx on public.bets(match_id);
create index if not exists bets_status_idx on public.bets(status);
create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists matches_kickoff_time_idx on public.matches(kickoff_time);
create index if not exists matches_status_idx on public.matches(status);

-- ============================================================
-- Auto-create profile on signup trigger
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, display_name, starting_fund, current_balance, role)
  values (new.id, v_display_name, 500, 500, 'player')
  on conflict (id) do nothing;

  insert into public.transactions (user_id, bet_id, type, amount, balance_after)
  values (new.id, null, 'initial_fund', 500, 500)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles     enable row level security;
alter table public.matches      enable row level security;
alter table public.bets         enable row level security;
alter table public.transactions enable row level security;

-- ---- Profiles ----
-- All authenticated users can view profiles (for leaderboard)
create policy "profiles_select" on public.profiles
  for select using (auth.role() = 'authenticated');

-- ---- Matches ----
-- All authenticated users can view matches
create policy "matches_select" on public.matches
  for select using (auth.role() = 'authenticated');

-- ---- Bets ----
-- All authenticated users can view all bets (public betting board)
create policy "bets_select" on public.bets
  for select using (auth.role() = 'authenticated');

-- Users can only insert bets for themselves
create policy "bets_insert_own" on public.bets
  for insert with check (auth.uid() = user_id);

-- ---- Transactions ----
-- Users can only view their own transactions
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

-- ============================================================
-- Helper: promote user to admin (run manually in Supabase SQL editor)
-- UPDATE public.profiles SET role = 'admin' WHERE id = '<user-uuid>';
-- ============================================================
