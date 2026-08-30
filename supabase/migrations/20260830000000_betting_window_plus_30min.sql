-- Extend the betting window: allow bets until 30 minutes AFTER kickoff
-- (was 5 minutes before). Rebuilds place_single_bet / place_parlay with the
-- new cutoff; everything else is unchanged.
begin;

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
  select * into v_player
  from public.season_players
  where user_id = p_user_id and season_id = v_season
  for update;
  if not found then raise exception 'SEASON_PLAYER_MISSING'; end if;
  if v_player.status <> 'active' then raise exception 'SEASON_CLOSED'; end if;

  select * into v_match from public.matches where id = p_match_id;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if v_match.season_id <> v_season then raise exception 'MATCH_WRONG_SEASON'; end if;

  -- Betting cutoff: closed at kickoff plus 30 minutes, or non-open status.
  if v_match.status in ('FINISHED','CANCELLED','POSTPONED','SUSPENDED','AWARDED')
     or now() >= (v_match.kickoff_time + interval '30 minutes') then
    raise exception 'BETTING_CLOSED';
  end if;

  if p_odds is null or p_odds <= 1 then raise exception 'BAD_ODDS'; end if;
  if p_stake is null or p_stake <= 0 then raise exception 'BAD_STAKE'; end if;

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
  update public.profiles set current_balance = v_new_balance where id = p_user_id;

  insert into public.transactions
    (user_id, bet_id, season_id, type, amount, balance_after)
  values
    (p_user_id, v_bet_id, v_season, 'stake_deduct', round(-p_stake, 2), v_new_balance);

  return jsonb_build_object(
    'bet_id', v_bet_id, 'new_balance', v_new_balance, 'season_id', v_season);
end;
$$;

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

  if v_player.outstanding_debt > 0 then raise exception 'DEBT_NO_PARLAY'; end if;
  if p_stake is null or p_stake <= 0 then raise exception 'BAD_STAKE'; end if;
  if p_total_odds is null or p_total_odds <= 1 then raise exception 'BAD_ODDS'; end if;
  if p_stake > v_player.current_balance then raise exception 'INSUFFICIENT_BALANCE'; end if;

  -- Every leg must be in the active season and before its cutoff (kickoff + 30m).
  foreach v_id in array p_match_ids loop
    select * into v_match from public.matches where id = v_id;
    if not found then raise exception 'MATCH_NOT_FOUND'; end if;
    if v_match.season_id <> v_season then raise exception 'MATCH_WRONG_SEASON'; end if;
    if v_match.status in ('FINISHED','CANCELLED','POSTPONED','SUSPENDED','AWARDED')
       or now() >= (v_match.kickoff_time + interval '30 minutes') then
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

commit;
