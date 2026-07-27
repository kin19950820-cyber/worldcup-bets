# Season 2 Migration Guide

Season 1 (世界盃 2026) must remain **closed and read-only**. This migration is
deliberately split into a **safe additive phase** and a **destructive activation
phase** so Season 1 is never at risk.

Migrations are applied via the **Supabase MCP / SQL editor** (they are not
auto-applied on deploy). Apply against **staging first**, verify, then production.

## Files

| Order | File | Type | When to run |
|---|---|---|---|
| 1 | `20260724000000_season2_phase1_additive.sql` | Additive, safe | Any time. Changes no balances/behaviour. |
| 2 | `20260724000100_season2_phase2_activation.sql` | **Destructive** | Only **together with** the season-aware app release. |
| — | `20260724000200_season2_rollback.sql` | Rollback | Only to unwind Season 2. |

## Phase 1 — additive (safe now)

Creates `seasons`, `season_players`, `loan_requests`; adds nullable `season_id`
(+ `competition_code`) to `matches`/`bets`/`transactions`; backfills every
existing row as Season 1 (EPL matches → Season 2); **snapshots** each player's
current balance into `season_players(season_id = 1)`; seeds
`season_players(season_id = 2)` at **$500**; adds indexes + RLS; widens the
`transactions` type check to allow `loan_principal` / `loan_fee` /
`debt_repayment` / `admin_adjustment`.

Nothing the running app reads is modified, so it can be applied with **zero
downtime and no behaviour change**.

**Verify after phase 1:**

```sql
-- Every existing row is tagged; no NULLs.
select count(*) from bets where season_id is null;            -- expect 0
select count(*) from transactions where season_id is null;    -- expect 0
select count(*) from matches where season_id is null;         -- expect 0

-- S1 snapshot == current live balance (S2 hasn't started).
select count(*) from season_players sp join profiles p on p.id = sp.user_id
  where sp.season_id = 1 and sp.current_balance <> p.current_balance;   -- expect 0

-- Every player has a $500 Season 2 row.
select count(*) from season_players where season_id = 2 and current_balance <> 500; -- expect 0
```

## Phase 2 — activation (destructive, ship with the app)

**Pre-req:** phase 1 applied and verified.

1. **Snapshot live balances** (rollback safety):
   ```sql
   create table if not exists _pre_season2_balances as
     select id, current_balance from public.profiles;
   ```
2. Deploy the season-aware application build **and** apply
   `20260724000100_season2_phase2_activation.sql` in the same window. It:
   - resets `profiles.current_balance` to the Season 2 value ($500), preserving
     Season 1 finals in `season_players(1)`;
   - installs the atomic RPCs (`place_single_bet`, `place_parlay`,
     `request_loan`, `approve_loan`, `reject_loan`, `settle_bet_season2`).
3. **Verify:**
   ```sql
   select count(*) from profiles where current_balance <> 500;  -- expect 0 at S2 start
   select proname from pg_proc where proname in
     ('place_single_bet','settle_bet_season2','approve_loan'); -- 3 rows
   ```

## Season 2 loan rules (enforced in `approve_loan` / `settle_bet_season2` + `lib/season2-loans.ts`)

- Loan = exactly **$500**, fixed **$50 fee** → **$550 debt**; only **$500** hits
  usable cash. Principal and fee are separate ledger rows (`loan_principal`
  `+500`, `loan_fee` `50` debt-only).
- Eligible only when **cash < $100**, **debt = $0**, **loans used < 2**.
- Max **2 loans/season**; cannot re-borrow until the previous loan is fully
  repaid.
- Winning payouts **repay debt first**; only the remainder becomes cash.
- While in debt: **single-stake ≤ $100**, **no parlays**, **no new loans**.

## Post-migration app behaviour

- The app defaults to the **active season** (`getActiveSeason()`), never a
  completed one.
- Betting closes **5 minutes before kickoff** (`isMatchBettable`), enforced in
  the server action and the RPCs; error 「此賽事已停止接受投注」.
- Season 1 pages are viewable but read-only; `settle_bet_season2` refuses bets
  in a closed season.

## Tests

`npm test` runs the pure-logic suite (loan eligibility/creation/repayment, bet
restrictions, cutoff boundaries, season defaulting). RPC/RLS/concurrency
behaviour must be verified on **staging** (cannot be unit-tested without a
Postgres instance).
