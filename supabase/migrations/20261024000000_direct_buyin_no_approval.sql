-- Direct buy-in: apply immediately, no admin approval. A new take_loan RPC
-- merges the old request_loan eligibility check with approve_loan's crediting
-- into one atomic, self-service call. request_loan / approve_loan stay in place
-- for any already-pending requests, but the app now calls take_loan.
begin;

create or replace function public.take_loan(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season      integer := public.active_season_id();
  v_player      public.season_players%rowtype;
  v_new_balance numeric;
  v_new_debt    numeric;
  v_req_id      uuid;
begin
  select * into v_player
  from public.season_players
  where user_id = p_user_id and season_id = v_season
  for update;
  if not found then raise exception 'SEASON_PLAYER_MISSING'; end if;
  if v_player.status <> 'active' then raise exception 'SEASON_CLOSED'; end if;

  -- Eligibility (unlimited buy-ins; gated on debt + balance only).
  if v_player.outstanding_debt > 0 then raise exception 'DEBT_OUTSTANDING'; end if;
  if v_player.current_balance > 100 then raise exception 'BALANCE_TOO_HIGH'; end if;

  -- No fee: cash and debt both rise by exactly $500.
  v_new_balance := round(v_player.current_balance + 500, 2);
  v_new_debt    := round(v_player.outstanding_debt + 500, 2);

  update public.season_players
    set current_balance = v_new_balance,
        outstanding_debt = v_new_debt,
        loan_count = v_player.loan_count + 1,
        updated_at = now()
    where id = v_player.id;
  update public.profiles set current_balance = v_new_balance where id = p_user_id;

  -- Audit trail: record it as an immediately-approved (self-service) buy-in.
  insert into public.loan_requests
    (season_id, user_id, amount, fee, status, decided_at, decided_by)
  values (v_season, p_user_id, 500, 0, 'approved', now(), p_user_id)
  returning id into v_req_id;

  insert into public.transactions
    (user_id, bet_id, season_id, type, amount, balance_after)
  values (p_user_id, null, v_season, 'loan_principal', 500, v_new_balance);

  return jsonb_build_object(
    'request_id', v_req_id,
    'new_balance', v_new_balance,
    'outstanding_debt', v_new_debt,
    'loan_count', v_player.loan_count + 1);
end;
$$;

revoke all on function public.take_loan(uuid) from public, anon, authenticated;
grant execute on function public.take_loan(uuid) to service_role;

commit;
