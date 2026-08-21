-- Group prize pool: real-money pot tracked per group, separate from the
-- in-game balance. Each member pays a basic buy-in; every rebuy (in-game loan)
-- adds an extra buy-in. The group owner sets the buy-in amounts and the final
-- champion / runner-up / third-place split ratios.
--
--   pool = members * buyin_amount + total_rebuys * rebuy_amount
--   總rebuys = 群組成員本季 loan_count 之和
begin;

alter table public.groups
  add column if not exists buyin_amount   numeric not null default 0,
  add column if not exists rebuy_amount   numeric not null default 0,
  add column if not exists payout_first   integer not null default 50,
  add column if not exists payout_second  integer not null default 30,
  add column if not exists payout_third   integer not null default 20;

-- Ratios are whole percentages in [0, 100]; the app validates they sum to 100.
alter table public.groups
  drop constraint if exists groups_payout_ratio_range;
alter table public.groups
  add constraint groups_payout_ratio_range check (
    payout_first between 0 and 100
    and payout_second between 0 and 100
    and payout_third between 0 and 100
  );

alter table public.groups
  drop constraint if exists groups_buyin_nonneg;
alter table public.groups
  add constraint groups_buyin_nonneg check (
    buyin_amount >= 0 and rebuy_amount >= 0
  );

commit;
