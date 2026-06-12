alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
  check (
    type in (
      'initial_fund',
      'stake_deduct',
      'payout',
      'refund',
      'adjustment',
      'loan'
    )
  );

create or replace function public.borrow_money(
  p_user_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_new_balance numeric;
begin
  if p_amount < 1 or p_amount >= 2000 then
    raise exception 'Loan amount must be less than 2000';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Player profile not found';
  end if;

  v_new_balance := round(v_profile.current_balance + p_amount, 2);

  update public.profiles
  set current_balance = v_new_balance
  where id = p_user_id;

  insert into public.transactions (
    user_id,
    bet_id,
    type,
    amount,
    balance_after
  )
  values (
    p_user_id,
    null,
    'loan',
    round(p_amount, 2),
    v_new_balance
  );

  return jsonb_build_object('new_balance', v_new_balance);
end;
$$;

revoke execute on function public.borrow_money(uuid, numeric) from public;
revoke execute on function public.borrow_money(uuid, numeric) from anon;
revoke execute on function public.borrow_money(uuid, numeric) from authenticated;
grant execute on function public.borrow_money(uuid, numeric) to service_role;
