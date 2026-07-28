-- ============================================================================
-- Season 2 — Phase 2: ACTIVATION. DESTRUCTIVE — DO NOT APPLY UNTIL:
--   1. Phase 1 has been applied and the season_players snapshot verified.
--   2. The season-aware application code is deployed in the SAME release.
--
-- This migration:
--   * resets profiles.current_balance to $500 for the Season 2 start
--     (Season 1 finals are preserved in season_players(season_id = 1)).
--   * installs the atomic money RPCs used by the season-aware app:
--       - place_single_bet, place_parlay   (cutoff + debt rules + row lock)
--       - request_loan, approve_loan, reject_loan
--       - settle_bet_season2               (debt-first repayment)
--   * All RPCs lock the active-season season_players row and refuse to touch
--     closed (Season 1) rows, enforcing read-only Season 1.
--
-- Every RPC is SECURITY DEFINER and granted to service_role only; the server
-- actions authenticate the user and pass p_user_id / p_admin_id.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Helper: the single active season id.
-- ---------------------------------------------------------------------------
create or replace function public.active_season_id()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select id from public.seasons where is_active order by id desc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 1. Reset live balance to the Season 2 starting $500.
--    Season 1 cash is already snapshotted in season_players(season_id = 1).
--    season_players(season_id = 2) already holds 500 from phase 1; this keeps
--    the profiles mirror consistent.
-- ---------------------------------------------------------------------------
update public.profiles p
  set current_balance = sp.current_balance
  from public.season_players sp
  where sp.user_id = p.id and sp.season_id = public.active_season_id();

-- ---------------------------------------------------------------------------
-- 2. Atomic single-bet placement.
-- ---------------------------------------------------------------------------
create or replace function public.place_single_bet(
  p_user_id   uuid,
  p_match_id  uuid,
  p_bet_type  text,
  p_selection text,
  p_odds      numeric,
  p_stake     numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season      integer := public.active_season_id();
  v_player      public.season_players%rowtype;
  v_match       public.matches%rowtype;
  v_possible    numeric;
  v_new_balance numeric;
  v_bet_id      uuid;
begin
  -- Lock the active-season player row for the duration of the transaction.
  select * into v_player
  from public.season_players
  where user_id = p_user_id and season_id = v_season
  for update;
  if not found then
    raise exception 'SEASON_PLAYER_MISSING';
  end if;
  if v_player.status <> 'active' then
    raise exception 'SEASON_CLOSED';
  end if;

  select * into v_match from public.matches where id = p_match_id;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if v_match.season_id <> v_season then raise exception 'MATCH_WRONG_SEASON'; end if;

  -- Betting cutoff: closed at kickoff minus 5 minutes, or non-open status.
  if v_match.status in ('FINISHED','CANCELLED','POSTPONED','SUSPENDED','AWARDED')
     or now() >= (v_match.kickoff_time - interval '5 minutes') then
    raise exception 'BETTING_CLOSED';
  end if;

  if p_odds is null or p_odds <= 1 then raise exception 'BAD_ODDS'; end if;
  if p_stake is null or p_stake <= 0 then raise exception 'BAD_STAKE'; end if;

  -- Debt restriction: while in debt, max single stake is $100.
  if v_player.outstanding_debt > 0 and p_stake > 100 then
    raise exception 'DEBT_STAKE_LIMIT';
  end if;

  if p_stake > v_player.current_balance then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  v_possible    := round(p_odds * p_stake, 2);
  v_new_balance := round(v_player.current_balance - p_stake, 2);

  insert into public.bets
    (user_id, match_id, season_id, bet_type, selection, odds, stake,
     possible_return, status)
  values
    (p_user_id, p_match_id, v_season, p_bet_type, p_selection, p_odds, p_stake,
     v_possible, 'pending')
  returning id into v_bet_id;

  update public.season_players
    set current_balance = v_new_balance, updated_at = now()
    where user_id = p_user_id and season_id = v_season;
  update public.profiles
    set current_balance = v_new_balance
    where id = p_user_id;

  insert into public.transactions
    (user_id, bet_id, season_id, type, amount, balance_after)
  values
    (p_user_id, v_bet_id, v_season, 'stake_deduct', round(-p_stake, 2), v_new_balance);

  return jsonb_build_object(
    'bet_id', v_bet_id, 'new_balance', v_new_balance, 'season_id', v_season);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Atomic parlay placement. p_match_ids drives per-leg cutoff checks.
-- ---------------------------------------------------------------------------
create or replace function public.place_parlay(
  p_user_id    uuid,
  p_match_ids  uuid[],
  p_selection  text,
  p_total_odds numeric,
  p_stake      numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season      integer := public.active_season_id();
  v_player      public.season_players%rowtype;
  v_match       public.matches%rowtype;
  v_id          uuid;
  v_possible    numeric;
  v_new_balance numeric;
  v_bet_id      uuid;
  v_primary     uuid := p_match_ids[1];
begin
  select * into v_player
  from public.season_players
  where user_id = p_user_id and season_id = v_season
  for update;
  if not found then raise exception 'SEASON_PLAYER_MISSING'; end if;
  if v_player.status <> 'active' then raise exception 'SEASON_CLOSED'; end if;

  -- Parlays are not allowed while in debt.
  if v_player.outstanding_debt > 0 then raise exception 'DEBT_NO_PARLAY'; end if;
  if p_stake is null or p_stake <= 0 then raise exception 'BAD_STAKE'; end if;
  if p_total_odds is null or p_total_odds <= 1 then raise exception 'BAD_ODDS'; end if;
  if p_stake > v_player.current_balance then raise exception 'INSUFFICIENT_BALANCE'; end if;

  -- Every leg must be in the active season and before its cutoff.
  foreach v_id in array p_match_ids loop
    select * into v_match from public.matches where id = v_id;
    if not found then raise exception 'MATCH_NOT_FOUND'; end if;
    if v_match.season_id <> v_season then raise exception 'MATCH_WRONG_SEASON'; end if;
    if v_match.status in ('FINISHED','CANCELLED','POSTPONED','SUSPENDED','AWARDED')
       or now() >= (v_match.kickoff_time - interval '5 minutes') then
      raise exception 'BETTING_CLOSED';
    end if;
  end loop;

  v_possible    := round(p_total_odds * p_stake, 2);
  v_new_balance := round(v_player.current_balance - p_stake, 2);

  insert into public.bets
    (user_id, match_id, season_id, bet_type, selection, odds, stake,
     possible_return, status)
  values
    (p_user_id, v_primary, v_season, '過關', p_selection, p_total_odds, p_stake,
     v_possible, 'pending')
  returning id into v_bet_id;

  update public.season_players
    set current_balance = v_new_balance, updated_at = now()
    where user_id = p_user_id and season_id = v_season;
  update public.profiles set current_balance = v_new_balance where id = p_user_id;

  insert into public.transactions
    (user_id, bet_id, season_id, type, amount, balance_after)
  values
    (p_user_id, v_bet_id, v_season, 'stake_deduct', round(-p_stake, 2), v_new_balance);

  return jsonb_build_object('bet_id', v_bet_id, 'new_balance', v_new_balance);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Loan request (player) — creates a pending request; unique index in
--    phase 1 prevents duplicate concurrent pending requests.
-- ---------------------------------------------------------------------------
create or replace function public.request_loan(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season integer := public.active_season_id();
  v_player public.season_players%rowtype;
  v_req_id uuid;
begin
  select * into v_player
  from public.season_players
  where user_id = p_user_id and season_id = v_season
  for update;
  if not found then raise exception 'SEASON_PLAYER_MISSING'; end if;

  if v_player.loan_count >= 2 then raise exception 'LOAN_LIMIT_REACHED'; end if;
  if v_player.outstanding_debt > 0 then raise exception 'DEBT_OUTSTANDING'; end if;
  if v_player.current_balance >= 100 then raise exception 'BALANCE_TOO_HIGH'; end if;

  insert into public.loan_requests (season_id, user_id, amount, fee, status)
  values (v_season, p_user_id, 500, 50, 'pending')
  returning id into v_req_id;

  return jsonb_build_object('request_id', v_req_id, 'status', 'pending');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Loan approval (admin) — atomic: re-checks eligibility under lock, credits
--    $500 cash, creates $550 debt, records principal + fee separately.
-- ---------------------------------------------------------------------------
create or replace function public.approve_loan(p_request_id uuid, p_admin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_role text;
  v_req        public.loan_requests%rowtype;
  v_player     public.season_players%rowtype;
  v_new_balance numeric;
  v_new_debt    numeric;
begin
  select role into v_admin_role from public.profiles where id = p_admin_id;
  if v_admin_role is distinct from 'admin' then raise exception 'NOT_ADMIN'; end if;

  select * into v_req from public.loan_requests where id = p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;

  select * into v_player
  from public.season_players
  where user_id = v_req.user_id and season_id = v_req.season_id
  for update;
  if not found then raise exception 'SEASON_PLAYER_MISSING'; end if;

  -- Re-check eligibility under the lock (never override the 2-loan cap here).
  if v_player.loan_count >= 2 then raise exception 'LOAN_LIMIT_REACHED'; end if;
  if v_player.outstanding_debt > 0 then raise exception 'DEBT_OUTSTANDING'; end if;

  v_new_balance := round(v_player.current_balance + 500, 2);
  v_new_debt    := round(v_player.outstanding_debt + 550, 2);

  update public.season_players
    set current_balance = v_new_balance,
        outstanding_debt = v_new_debt,
        loan_count = v_player.loan_count + 1,
        updated_at = now()
    where id = v_player.id;
  update public.profiles set current_balance = v_new_balance where id = v_req.user_id;

  update public.loan_requests
    set status = 'approved', decided_at = now(), decided_by = p_admin_id
    where id = p_request_id;

  -- $500 principal credits usable cash; $50 fee is debt-only (balance_after
  -- unchanged, so it never becomes spendable cash).
  insert into public.transactions
    (user_id, bet_id, season_id, type, amount, balance_after)
  values
    (v_req.user_id, null, v_req.season_id, 'loan_principal', 500, v_new_balance),
    (v_req.user_id, null, v_req.season_id, 'loan_fee', 50, v_new_balance);

  return jsonb_build_object(
    'new_balance', v_new_balance,
    'outstanding_debt', v_new_debt,
    'loan_count', v_player.loan_count + 1);
end;
$$;

create or replace function public.reject_loan(
  p_request_id uuid, p_admin_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_admin_role text;
begin
  select role into v_admin_role from public.profiles where id = p_admin_id;
  if v_admin_role is distinct from 'admin' then raise exception 'NOT_ADMIN'; end if;

  update public.loan_requests
    set status = 'rejected', reject_reason = p_reason,
        decided_at = now(), decided_by = p_admin_id
    where id = p_request_id and status = 'pending';
  if not found then raise exception 'REQUEST_NOT_PENDING'; end if;
  return jsonb_build_object('status', 'rejected');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Settlement with debt-first repayment. Refuses closed (Season 1) bets so
--    Season 1 stays read-only. Prevents double settlement (status must be
--    pending, updated atomically).
-- ---------------------------------------------------------------------------
create or replace function public.settle_bet_season2(p_bet_id uuid, p_result text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet         public.bets%rowtype;
  v_season      public.seasons%rowtype;
  v_player      public.season_players%rowtype;
  v_player_name text;
  v_payout      numeric;
  v_repaid      numeric;
  v_cash        numeric;
  v_new_debt    numeric;
  v_new_balance numeric;
begin
  select * into v_bet from public.bets where id = p_bet_id for update;
  if not found then raise exception 'BET_NOT_FOUND'; end if;
  if v_bet.status <> 'pending' then raise exception 'ALREADY_SETTLED'; end if;
  select display_name into v_player_name from public.profiles where id = v_bet.user_id;

  select * into v_season from public.seasons where id = v_bet.season_id;
  if v_season.is_closed then raise exception 'SEASON_CLOSED'; end if;

  v_payout := round(case p_result
      when 'won'       then v_bet.stake * v_bet.odds
      when 'half_won'  then v_bet.stake + (v_bet.stake * (v_bet.odds - 1)) / 2
      when 'half_lost' then v_bet.stake / 2
      when 'void'      then v_bet.stake
      else 0 end, 2);

  select * into v_player
  from public.season_players
  where user_id = v_bet.user_id and season_id = v_bet.season_id
  for update;
  if not found then raise exception 'SEASON_PLAYER_MISSING'; end if;

  -- Debt-first: repay outstanding debt before crediting usable cash.
  v_repaid      := round(least(v_payout, v_player.outstanding_debt), 2);
  v_cash        := round(v_payout - v_repaid, 2);
  v_new_debt    := round(v_player.outstanding_debt - v_repaid, 2);
  v_new_balance := round(v_player.current_balance + v_cash, 2);

  update public.bets
    set status = p_result, payout = v_payout, settled_at = now()
    where id = p_bet_id and status = 'pending';
  if not found then raise exception 'ALREADY_SETTLED'; end if;

  update public.season_players
    set current_balance = v_new_balance, outstanding_debt = v_new_debt,
        updated_at = now()
    where id = v_player.id;
  update public.profiles set current_balance = v_new_balance
    where id = v_bet.user_id;

  if v_cash <> 0 then
    insert into public.transactions
      (user_id, bet_id, season_id, type, amount, balance_after)
    values
      (v_bet.user_id, p_bet_id, v_bet.season_id,
       case when p_result in ('void','half_lost') then 'refund' else 'payout' end,
       v_cash, v_new_balance);
  end if;
  if v_repaid <> 0 then
    insert into public.transactions
      (user_id, bet_id, season_id, type, amount, balance_after)
    values
      (v_bet.user_id, p_bet_id, v_bet.season_id, 'debt_repayment',
       round(-v_repaid, 2), v_new_balance);
  end if;

  return jsonb_build_object(
    'payout', v_payout, 'debt_repaid', v_repaid, 'cash_credited', v_cash,
    'outstanding_debt', v_new_debt, 'new_balance', v_new_balance,
    'stake', v_bet.stake, 'player_name', v_player_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Lock down execution to the service role only.
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'place_single_bet(uuid,uuid,text,text,numeric,numeric)',
    'place_parlay(uuid,uuid[],text,numeric,numeric)',
    'request_loan(uuid)',
    'approve_loan(uuid,uuid)',
    'reject_loan(uuid,uuid,text)',
    'settle_bet_season2(uuid,text)',
    'active_season_id()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated;', fn);
    execute format('grant execute on function public.%s to service_role;', fn);
  end loop;
end $$;

commit;
