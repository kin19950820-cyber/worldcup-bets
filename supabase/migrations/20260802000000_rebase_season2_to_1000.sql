-- Re-base Season 2 starting balance from $500 to $1000. A rebuy (loan) stays
-- $500. Existing players are topped up by the $500 difference so every player's
-- profit/loss is preserved (starting +500, cash +500 → net worth unchanged).
--
-- Idempotent: guarded on starting_balance = 500, so re-running is a no-op.
begin;

-- 1. Top up the live cash mirror for active Season 2 players still on $500 base.
update public.profiles p
  set current_balance = p.current_balance + 500
  from public.season_players sp
  where sp.user_id = p.id
    and sp.season_id = 2
    and sp.status = 'active'
    and sp.starting_balance = 500;

-- 2. Re-base the Season 2 season_players rows.
update public.season_players
  set starting_balance = 1000,
      current_balance = current_balance + 500,
      updated_at = now()
  where season_id = 2 and starting_balance = 500;

-- 3. New rows default to the $1000 base going forward.
alter table public.season_players
  alter column starting_balance set default 1000,
  alter column current_balance  set default 1000;

commit;
