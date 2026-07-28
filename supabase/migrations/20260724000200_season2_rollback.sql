-- ============================================================================
-- Season 2 — ROLLBACK. Run manually only if Season 2 must be unwound.
--
-- This reverses phases 1 and 2. It is SAFE for Season 1 history: Season 1 bets,
-- transactions and results are never deleted — only the additive season columns
-- and Season 2 scaffolding are removed.
--
-- ⚠ It does NOT restore profiles.current_balance if phase 2's reset already
--   ran. Before applying phase 2 in production, snapshot profiles.current_balance
--   (see docs/SEASON2_ROLLBACK.md); restore it here if needed:
--     -- update public.profiles p set current_balance = b.current_balance
--     --   from _pre_season2_balances b where b.id = p.id;
-- ============================================================================

begin;

-- 1. Drop the RPCs (phase 2).
drop function if exists public.place_single_bet(uuid,uuid,text,text,numeric,numeric);
drop function if exists public.place_parlay(uuid,uuid[],text,numeric,numeric);
drop function if exists public.request_loan(uuid);
drop function if exists public.approve_loan(uuid,uuid);
drop function if exists public.reject_loan(uuid,uuid,text);
drop function if exists public.settle_bet_season2(uuid,text);
drop function if exists public.active_season_id();

-- 2. Drop RLS policies + Season 2 tables.
drop policy if exists loan_requests_read_own on public.loan_requests;
drop policy if exists season_players_read on public.season_players;
drop table if exists public.loan_requests;
drop table if exists public.season_players;

-- 3. Drop the additive columns (Season 1 data in these tables is untouched).
drop index if exists public.matches_season_id_idx;
drop index if exists public.bets_season_id_idx;
drop index if exists public.transactions_season_id_idx;
alter table public.matches      drop column if exists season_id, drop column if exists competition_code;
alter table public.bets         drop column if exists season_id;
alter table public.transactions drop column if exists season_id;

-- 4. Restore the pre-Season-2 transaction type check (removes new loan types).
--    Only safe if no rows use the new types; otherwise keep the widened check.
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check
  check (type in (
    'initial_fund', 'stake_deduct', 'payout', 'refund', 'adjustment',
    'loan', 'loan_repayment'
  ));

-- 5. Drop the seasons table last (referenced by the columns dropped above).
drop table if exists public.seasons;

commit;
