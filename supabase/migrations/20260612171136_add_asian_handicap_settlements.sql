alter table public.bets
  drop constraint if exists bets_status_check;

alter table public.bets
  add constraint bets_status_check
  check (status in ('pending', 'won', 'half_won', 'lost', 'half_lost', 'void'));

create or replace function public.settle_bet(
  p_bet_id uuid,
  p_result text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bet public.bets%rowtype;
  v_profile public.profiles%rowtype;
  v_payout numeric;
  v_new_balance numeric;
  v_transaction_type text;
begin
  if p_result not in ('won', 'half_won', 'lost', 'half_lost', 'void') then
    raise exception 'Invalid settlement result: %', p_result;
  end if;

  select *
  into v_bet
  from public.bets
  where id = p_bet_id
  for update;

  if not found then
    raise exception 'Bet not found';
  end if;

  if v_bet.status <> 'pending' then
    raise exception 'Bet has already been settled: %', v_bet.status;
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_bet.user_id
  for update;

  if not found then
    raise exception 'Player profile not found';
  end if;

  v_payout := case p_result
    when 'won' then round(v_bet.stake * v_bet.odds, 2)
    when 'half_won' then round(
      v_bet.stake + (v_bet.stake * (v_bet.odds - 1) / 2),
      2
    )
    when 'half_lost' then round(v_bet.stake / 2, 2)
    when 'void' then v_bet.stake
    else 0
  end;

  v_new_balance := round(v_profile.current_balance + v_payout, 2);
  v_transaction_type := case
    when p_result in ('void', 'half_lost') then 'refund'
    else 'payout'
  end;

  update public.bets
  set status = p_result,
      payout = v_payout,
      settled_at = now()
  where id = p_bet_id;

  if v_payout > 0 then
    update public.profiles
    set current_balance = v_new_balance
    where id = v_bet.user_id;

    insert into public.transactions (
      user_id,
      bet_id,
      type,
      amount,
      balance_after
    )
    values (
      v_bet.user_id,
      v_bet.id,
      v_transaction_type,
      v_payout,
      v_new_balance
    );
  end if;

  return jsonb_build_object(
    'payout', v_payout,
    'new_balance', v_new_balance,
    'stake', v_bet.stake,
    'player_name', v_profile.display_name
  );
end;
$$;

revoke execute on function public.settle_bet(uuid, text) from public;
revoke execute on function public.settle_bet(uuid, text) from anon;
revoke execute on function public.settle_bet(uuid, text) from authenticated;
grant execute on function public.settle_bet(uuid, text) to service_role;
