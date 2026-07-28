# Season 2 Rollback Guide

Rollback is **safe for Season 1 history** — Season 1 bets, transactions, results
and hall-of-fame data are never deleted. Only Season 2 scaffolding and the
additive columns are removed.

## Before phase 2 (only phase 1 applied)

Phase 1 is purely additive, so rollback is trivial and lossless:

```sql
\i supabase/migrations/20260724000200_season2_rollback.sql
```

This drops `seasons`, `season_players`, `loan_requests`, the `season_id` /
`competition_code` columns, and restores the original `transactions` type check.
No balance was ever changed, so nothing else is needed.

## After phase 2 (activation applied)

Phase 2 reset `profiles.current_balance` to $500 and may have created Season 2
bets/transactions. Rolling back fully means restoring the pre-Season-2 balances:

1. **Restore live balances** from the snapshot taken in the migration guide:
   ```sql
   update public.profiles p
     set current_balance = b.current_balance
     from _pre_season2_balances b
     where b.id = p.id;
   ```
   > If Season 2 betting already happened and you want to keep it, **skip this
   > step** — leave `profiles.current_balance` as-is and only drop the RPCs.

2. **Decide on Season 2 rows.** Season 2 bets/transactions are tagged
   `season_id = 2`. To purge them (optional, only if fully abandoning S2):
   ```sql
   delete from public.transactions where season_id = 2;
   delete from public.bets where season_id = 2;
   delete from public.matches where season_id = 2 and competition_code = 'PL';
   ```
   Season 1 rows (`season_id = 1`) are untouched.

3. **Run the rollback migration** to drop tables/columns/RPCs:
   ```sql
   \i supabase/migrations/20260724000200_season2_rollback.sql
   ```

4. **Redeploy the pre-Season-2 application build** (the one that reads
   `profiles.current_balance` without season awareness).

## Verify

```sql
-- Columns/tables gone.
select column_name from information_schema.columns
  where table_name = 'bets' and column_name = 'season_id';   -- 0 rows
select to_regclass('public.season_players');                  -- NULL

-- Season 1 intact.
select count(*) from bets;          -- unchanged from pre-migration count
select count(*) from transactions;  -- unchanged (unless S2 rows purged)
```

## Partial rollback (keep data, revert code only)

If you only need to revert the **app** (not the data): redeploy the previous
build. The additive columns and tables are ignored by the old code, so the app
keeps working on `profiles.current_balance`. No SQL rollback required.
