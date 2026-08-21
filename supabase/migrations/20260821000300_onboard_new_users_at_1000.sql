-- New-user onboarding: start at the $1000 Season 2 base and seed an
-- active-season season_players row.
--
-- The original handle_new_user() still created a $500 profile and no
-- season_players row, so brand-new users started at $500 and — worse — could
-- not bet at all (place_single_bet raises SEASON_PLAYER_MISSING without a row).
-- This rebuilds the trigger and backfills anyone already onboarded that way.
begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_season integer := public.active_season_id();
begin
  v_display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, display_name, starting_fund, current_balance, role)
  values (new.id, v_display_name, 1000, 1000, 'player')
  on conflict (id) do nothing;

  insert into public.transactions (user_id, bet_id, season_id, type, amount, balance_after)
  values (new.id, null, v_season, 'initial_fund', 1000, 1000)
  on conflict do nothing;

  -- Season row so the player can immediately place bets / take rebuys.
  insert into public.season_players
    (season_id, user_id, starting_balance, current_balance,
     outstanding_debt, loan_count, status)
  values (v_season, new.id, 1000, 1000, 0, 0, 'active')
  on conflict (season_id, user_id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill players onboarded at $500 with no active-season row. The
-- "no season row" guard means they never participated in the season via the
-- RPCs, so resetting them to the $1000 base is safe.
-- ---------------------------------------------------------------------------

-- 1. Bump their profile mirror + starting fund to the $1000 base.
update public.profiles p
  set current_balance = 1000, starting_fund = 1000
where p.starting_fund = 500
  and p.current_balance = 500
  and not exists (
    select 1 from public.season_players sp
    where sp.user_id = p.id and sp.season_id = public.active_season_id()
  );

-- 2. Fix their season initial_fund ledger point so the trend starts at $1000.
update public.transactions t
  set amount = 1000, balance_after = 1000
where t.type = 'initial_fund'
  and t.amount = 500
  and t.season_id = public.active_season_id()
  and not exists (
    select 1 from public.season_players sp
    where sp.user_id = t.user_id and sp.season_id = public.active_season_id()
  );

-- 3. Seed the missing active-season rows at the $1000 base.
insert into public.season_players
  (season_id, user_id, starting_balance, current_balance,
   outstanding_debt, loan_count, status)
select public.active_season_id(), p.id, 1000, 1000, 0, 0, 'active'
from public.profiles p
where not exists (
  select 1 from public.season_players sp
  where sp.user_id = p.id and sp.season_id = public.active_season_id()
)
on conflict (season_id, user_id) do nothing;

commit;
