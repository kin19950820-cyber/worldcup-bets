-- ============================================================================
-- Season 2 — Phase 1: ADDITIVE ONLY. Safe to apply to production at any time.
--
-- This migration does NOT change any existing balance, bet, transaction, loan
-- or leaderboard value, and does NOT alter application behaviour. It only:
--   * creates season / season_players / loan_requests tables
--   * adds nullable season_id (+ competition_code) columns
--   * backfills every existing row as Season 1 (EPL rows as Season 2)
--   * snapshots each player's Season 1 standing into season_players
--   * seeds Season 2 player rows at $500
--   * adds indexes + RLS for the new tables
--   * widens the transactions type check to allow new loan types
--
-- The destructive cutover (resetting profiles.current_balance to $500, adding
-- the atomic RPCs) lives in phase 2 and must only run WITH the app cutover.
-- Idempotent: safe to re-run.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. seasons
-- ---------------------------------------------------------------------------
create table if not exists public.seasons (
  id          integer primary key,
  name        text        not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  is_active   boolean     not null default false,
  is_closed   boolean     not null default false,
  created_at  timestamptz not null default now()
);

insert into public.seasons (id, name, starts_at, ends_at, is_active, is_closed)
values
  (1, '第一季 · 世界盃 2026', '2026-06-01T00:00:00+08:00', '2026-07-23T00:00:00+08:00', false, true),
  (2, '第二季 · 英超 2026/27', '2026-07-23T00:00:00+08:00', null, true, false)
on conflict (id) do update
  set name = excluded.name,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      is_active = excluded.is_active,
      is_closed = excluded.is_closed;

-- ---------------------------------------------------------------------------
-- 2. season_players — per-season balance / debt / loan tracking
-- ---------------------------------------------------------------------------
create table if not exists public.season_players (
  id                uuid primary key default gen_random_uuid(),
  season_id         integer     not null references public.seasons(id),
  user_id           uuid        not null references public.profiles(id) on delete cascade,
  starting_balance  numeric     not null default 500,
  current_balance   numeric     not null default 500,
  outstanding_debt  numeric     not null default 0 check (outstanding_debt >= 0),
  loan_count        integer     not null default 0 check (loan_count >= 0 and loan_count <= 2),
  status            text        not null default 'active' check (status in ('active', 'closed')),
  joined_at         timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (season_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 3. loan_requests — auditable loan approval flow (Season 2)
-- ---------------------------------------------------------------------------
create table if not exists public.loan_requests (
  id            uuid primary key default gen_random_uuid(),
  season_id     integer     not null references public.seasons(id),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  amount        numeric     not null default 500,
  fee           numeric     not null default 50,
  status        text        not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  reject_reason text,
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references public.profiles(id)
);

-- At most one outstanding (pending) request per player per season.
create unique index if not exists loan_requests_one_pending
  on public.loan_requests (season_id, user_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 4. season_id (+ competition_code) columns — nullable, default active season
-- ---------------------------------------------------------------------------
alter table public.matches
  add column if not exists season_id integer references public.seasons(id) default 2,
  add column if not exists competition_code text;

alter table public.bets
  add column if not exists season_id integer references public.seasons(id) default 2;

alter table public.transactions
  add column if not exists season_id integer references public.seasons(id) default 2;

-- ---------------------------------------------------------------------------
-- 5. Backfill existing rows. Everything that exists today is Season 1, except
--    EPL matches already synced (stage = '英超') which are Season 2.
-- ---------------------------------------------------------------------------
update public.matches
  set season_id = case when stage = '英超' then 2 else 1 end,
      competition_code = case when stage = '英超' then 'PL' else 'WC' end
  where season_id is null or competition_code is null;

-- Bets / transactions: tagged by the season window (S1 ends 2026-07-23 HKT).
update public.bets b
  set season_id = case
        when b.created_at < timestamptz '2026-07-23T00:00:00+08:00' then 1 else 2 end
  where b.season_id is null;

update public.transactions t
  set season_id = case
        when t.created_at < timestamptz '2026-07-23T00:00:00+08:00' then 1 else 2 end
  where t.season_id is null;

-- ---------------------------------------------------------------------------
-- 6. Widen transaction type check to allow the new Season 2 loan types.
--    Existing S1 types are preserved.
-- ---------------------------------------------------------------------------
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check
  check (type in (
    'initial_fund', 'stake_deduct', 'payout', 'refund', 'adjustment',
    'loan', 'loan_repayment',
    'loan_principal', 'loan_fee', 'debt_repayment', 'admin_adjustment'
  ));

-- ---------------------------------------------------------------------------
-- 7. Snapshot Season 1 standings (read-only history) and seed Season 2 at $500.
--    Season 1 snapshot captures each player's CURRENT balance = their S1 final
--    (Season 2 has not started spending yet). outstanding_debt is left 0 here;
--    Season 1 debt continues to be computed by the existing ledger code, which
--    this migration does not touch — so Season 1 views are unchanged.
-- ---------------------------------------------------------------------------
insert into public.season_players
  (season_id, user_id, starting_balance, current_balance, outstanding_debt, loan_count, status)
select
  1,
  p.id,
  coalesce(p.starting_fund, 500),
  p.current_balance,
  0,
  least(
    (select count(*) from public.transactions t
       where t.user_id = p.id and t.type in ('loan', 'loan_principal')
         and t.created_at < timestamptz '2026-07-23T00:00:00+08:00'),
    2
  ),
  'closed'
from public.profiles p
on conflict (season_id, user_id) do nothing;

insert into public.season_players
  (season_id, user_id, starting_balance, current_balance, outstanding_debt, loan_count, status)
select 2, p.id, 500, 500, 0, 0, 'active'
from public.profiles p
on conflict (season_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Indexes
-- ---------------------------------------------------------------------------
create index if not exists matches_season_id_idx      on public.matches(season_id);
create index if not exists bets_season_id_idx          on public.bets(season_id);
create index if not exists transactions_season_id_idx  on public.transactions(season_id);
create index if not exists season_players_user_idx     on public.season_players(user_id);
create index if not exists season_players_season_idx   on public.season_players(season_id);
create index if not exists loan_requests_user_idx      on public.loan_requests(user_id, season_id);

-- ---------------------------------------------------------------------------
-- 9. RLS for the new tables. Reads are public (standings are public in-app);
--    all writes are service-role only (server actions / RPCs).
-- ---------------------------------------------------------------------------
alter table public.season_players enable row level security;
alter table public.loan_requests  enable row level security;

drop policy if exists season_players_read on public.season_players;
create policy season_players_read on public.season_players
  for select using (true);

drop policy if exists loan_requests_read_own on public.loan_requests;
create policy loan_requests_read_own on public.loan_requests
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policies: writes go through the service role only.

commit;
