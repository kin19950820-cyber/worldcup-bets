-- Ensure the bets status check constraint allows Asian-handicap half results.
-- The original constraint from 001_initial.sql only permitted
-- ('pending', 'won', 'lost', 'void'); settling a bet as 'half_won' or
-- 'half_lost' fails with: new row for relation "bets" violates check
-- constraint "bets_status_check". This re-applies the widened constraint
-- idempotently in case the earlier settlement migration never reached the
-- live database.

alter table public.bets
  drop constraint if exists bets_status_check;

alter table public.bets
  add constraint bets_status_check
  check (status in ('pending', 'won', 'half_won', 'lost', 'half_lost', 'void'));
