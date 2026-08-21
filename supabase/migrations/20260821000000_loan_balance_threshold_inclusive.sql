-- Loan eligibility: make the "$100 or below" cash threshold INCLUSIVE.
--
-- Season 2 base balance is $1000. A player who bets $900 is left with exactly
-- $100 cash and should qualify for a rebuy (loan). The original rule rejected
-- at exactly $100 (`current_balance >= 100`), i.e. required strictly below $100.
-- Loosen it to `> 100` so cash of exactly $100 is eligible.
--
-- Only the request_loan RPC carried the balance gate; approve_loan never did.
begin;

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
  if v_player.current_balance > 100 then raise exception 'BALANCE_TOO_HIGH'; end if;

  insert into public.loan_requests (season_id, user_id, amount, fee, status)
  values (v_season, p_user_id, 500, 50, 'pending')
  returning id into v_req_id;

  return jsonb_build_object('request_id', v_req_id, 'status', 'pending');
end;
$$;

commit;
