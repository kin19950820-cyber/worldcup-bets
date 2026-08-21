-- Unlimited rebuys: remove the Season 2 two-loan cap.
--
-- Drops the season_players.loan_count <= 2 CHECK constraint and rebuilds the
-- request_loan / approve_loan RPCs without the LOAN_LIMIT_REACHED gate. The
-- remaining eligibility rules stay: cash must be <= $100 and outstanding debt
-- must be $0 before a new rebuy.
begin;

-- Drop the count cap (the constraint name from the phase-1 migration).
alter table public.season_players
  drop constraint if exists season_players_loan_count_check;
-- Keep loan_count non-negative.
alter table public.season_players
  add constraint season_players_loan_count_check check (loan_count >= 0);

-- Player loan request — no more count cap.
create or replace function public.request_loan(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_season integer := public.active_season_id();
  v_player public.season_players%rowtype;
  v_req_id uuid;
begin
  select * into v_player from public.season_players
  where user_id = p_user_id and season_id = v_season for update;
  if not found then raise exception 'SEASON_PLAYER_MISSING'; end if;
  if v_player.outstanding_debt > 0 then raise exception 'DEBT_OUTSTANDING'; end if;
  if v_player.current_balance > 100 then raise exception 'BALANCE_TOO_HIGH'; end if;

  insert into public.loan_requests (season_id, user_id, amount, fee, status)
  values (v_season, p_user_id, 500, 50, 'pending') returning id into v_req_id;
  return jsonb_build_object('request_id', v_req_id, 'status', 'pending');
end; $$;

-- Admin approval — no more count cap.
create or replace function public.approve_loan(p_request_id uuid, p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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

  -- Re-check eligibility under the lock (rebuy count is unlimited now).
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

  insert into public.transactions
    (user_id, bet_id, season_id, type, amount, balance_after)
  values
    (v_req.user_id, null, v_req.season_id, 'loan_principal', 500, v_new_balance),
    (v_req.user_id, null, v_req.season_id, 'loan_fee', 50, v_new_balance);

  return jsonb_build_object(
    'new_balance', v_new_balance,
    'outstanding_debt', v_new_debt,
    'loan_count', v_player.loan_count + 1);
end; $$;

commit;
