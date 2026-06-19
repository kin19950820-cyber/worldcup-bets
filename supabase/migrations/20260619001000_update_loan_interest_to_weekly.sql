drop function if exists public.loan_annual_interest_amount(numeric);

create or replace function public.loan_weekly_interest_amount(
  p_principal numeric
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_remaining numeric := greatest(coalesce(p_principal, 0), 0);
  v_tier integer := 1;
  v_chunk numeric;
  v_interest numeric := 0;
begin
  while v_remaining > 0 loop
    v_chunk := least(v_remaining, 1000);
    v_interest := v_interest + (v_chunk * v_tier * 0.10);
    v_remaining := v_remaining - v_chunk;
    v_tier := v_tier + 1;
  end loop;

  return v_interest;
end;
$$;

create or replace function public.calculate_loan_balance(
  p_user_id uuid,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction record;
  v_principal numeric := 0;
  v_interest numeric := 0;
  v_previous_at timestamptz;
  v_elapsed_days numeric;
  v_payment numeric;
  v_interest_paid numeric;
  v_weekly_interest numeric;
begin
  for v_transaction in
    select amount, type, created_at
    from public.transactions
    where user_id = p_user_id
      and bet_id is null
      and type in ('loan', 'adjustment', 'loan_repayment')
    order by created_at asc, id asc
  loop
    if v_previous_at is not null
      and v_transaction.created_at > v_previous_at
      and v_principal > 0
    then
      v_elapsed_days :=
        extract(epoch from (v_transaction.created_at - v_previous_at)) /
        86400.0;
      v_interest :=
        v_interest +
        (
          public.loan_weekly_interest_amount(v_principal) *
          v_elapsed_days /
          7.0
        );
    end if;

    if v_transaction.type in ('loan', 'adjustment')
      and v_transaction.amount > 0
    then
      v_principal := v_principal + v_transaction.amount;
    elsif v_transaction.type = 'loan_repayment' then
      v_payment := abs(v_transaction.amount);
      v_interest_paid := least(v_payment, v_interest);
      v_interest := v_interest - v_interest_paid;
      v_payment := v_payment - v_interest_paid;
      v_principal := greatest(v_principal - v_payment, 0);
    end if;

    v_previous_at := v_transaction.created_at;
  end loop;

  if v_previous_at is not null
    and p_as_of > v_previous_at
    and v_principal > 0
  then
    v_elapsed_days := extract(epoch from (p_as_of - v_previous_at)) / 86400.0;
    v_interest :=
      v_interest +
      (
        public.loan_weekly_interest_amount(v_principal) *
        v_elapsed_days /
        7.0
      );
  end if;

  v_principal := round(v_principal, 2);
  v_interest := round(v_interest, 2);
  v_weekly_interest := public.loan_weekly_interest_amount(v_principal);

  return jsonb_build_object(
    'principal', v_principal,
    'accrued_interest', v_interest,
    'total_owed', round(v_principal + v_interest, 2),
    'effective_weekly_rate',
      case
        when v_principal > 0 then v_weekly_interest / v_principal
        else 0
      end
  );
end;
$$;

revoke execute on function public.loan_weekly_interest_amount(numeric) from public;
revoke execute on function public.loan_weekly_interest_amount(numeric) from anon;
revoke execute on function public.loan_weekly_interest_amount(numeric) from authenticated;
grant execute on function public.loan_weekly_interest_amount(numeric) to service_role;
