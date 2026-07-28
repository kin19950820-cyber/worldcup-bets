-- Fix: 20260724000000's backfill for bets/transactions used
-- `where season_id is null`, but the preceding `add column ... default 2`
-- had already filled every existing row with 2, so the backfill matched
-- nothing. All pre-cutover bets/transactions ended up mislabeled season 2
-- (matches escaped this because their backfill also checked
-- `competition_code is null`, which was genuinely null for old rows).
begin;

update public.bets
  set season_id = 1
  where created_at < timestamptz '2026-07-23T00:00:00+08:00'
    and season_id <> 1;

update public.transactions
  set season_id = 1
  where created_at < timestamptz '2026-07-23T00:00:00+08:00'
    and season_id <> 1;

commit;
