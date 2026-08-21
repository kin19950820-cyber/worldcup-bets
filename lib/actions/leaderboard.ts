"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { classifyBetOutcome, computeStreaks } from "@/lib/bet-stats";
import { getActiveSeason, getSeason } from "@/lib/seasons";
import { SEASON2_STARTING_BALANCE, SEASON2_LOAN } from "@/lib/season2-loans";
import type { LeaderboardEntry } from "@/lib/types";

// Cash-affecting transaction types for the net-worth trend (both legacy and
// Season 2 flat-loan types; rows are season-filtered).
const FUND_TREND_TRANSACTION_TYPES = [
  "initial_fund",
  "payout",
  "refund",
  "loan",
  "adjustment",
  "loan_repayment",
  "loan_principal",
  "debt_repayment",
  "admin_adjustment",
];

export async function getLeaderboard(): Promise<{ entries: LeaderboardEntry[] }> {
  const supabase = await createClient();
  const service = createServiceClient();

  // Authorize the caller, then read the public leaderboard data with the
  // service client. The leaderboard shows every player, so RLS-scoped reads
  // (which can come back empty on a stale/edge session) are the wrong tool
  // here — the same reason transactions/group_members already use service.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { entries: [] };

  // The 龍虎榜 reflects the ACTIVE season only — bets, transactions, starting
  // balance and debt are all scoped to it, so Season 1 (World Cup) results are
  // reset out of the ranking.
  const seasonId = getActiveSeason().id;

  const [
    profilesRes,
    betsRes,
    loanEventsRes,
    historyRes,
    membersRes,
    seasonPlayersRes,
    groupsRes,
  ] = await Promise.all([
      service
        .from("profiles")
        .select(
          "id, display_name, current_balance, starting_fund, created_at, group_id"
        ),
      service
        .from("bets")
        .select("id, user_id, bet_type, status, stake, payout, odds, created_at, settled_at")
        .eq("season_id", seasonId),
      // Season 2 loan events, to reconstruct outstanding debt over time.
      service
        .from("transactions")
        .select("user_id, amount, type, created_at")
        .eq("season_id", seasonId)
        .in("type", ["loan_principal", "debt_repayment"])
        .order("created_at", { ascending: true }),
      service
        .from("transactions")
        .select("user_id, amount, type, balance_after, created_at")
        .eq("season_id", seasonId)
        .in("type", FUND_TREND_TRANSACTION_TYPES)
        .order("created_at", { ascending: true }),
      service.from("group_members").select("group_id, user_id"),
      service
        .from("season_players")
        .select("user_id, starting_balance, current_balance, outstanding_debt, loan_count")
        .eq("season_id", seasonId),
      service.from("groups").select("id, name"),
    ]);

  // Legacy primary group name, looked up separately to avoid an ambiguous
  // PostgREST embed (profiles ↔ groups now has two FK paths).
  const groupNameById = new Map(
    (
      (groupsRes.data as { id: string; name: string }[] | null) ?? []
    ).map((g) => [g.id, g.name])
  );

  const profiles = profilesRes.data ?? [];
  const bets = betsRes.data ?? [];
  const history = historyRes.data ?? [];
  const seasonStart = getSeason(seasonId)?.start ?? null;

  // Per-user Season 2 loan events (sorted asc) → outstanding debt at any time.
  const loanEventsByUser = new Map<
    string,
    { type: string; amount: number; created_at: string }[]
  >();
  for (const ev of (loanEventsRes.data as
    | { user_id: string; type: string; amount: number; created_at: string }[]
    | null) ?? []) {
    const list = loanEventsByUser.get(ev.user_id) ?? [];
    list.push(ev);
    loanEventsByUser.set(ev.user_id, list);
  }
  const debtAtFor = (userId: string, iso: string) => {
    const t = new Date(iso).getTime();
    let debt = 0;
    for (const ev of loanEventsByUser.get(userId) ?? []) {
      if (new Date(ev.created_at).getTime() > t) break;
      if (ev.type === "loan_principal") debt += SEASON2_LOAN.debt;
      else if (ev.type === "debt_repayment") debt -= Math.abs(ev.amount);
    }
    return Math.max(0, Math.round(debt * 100) / 100);
  };

  // Active-season starting/current balance, debt + rebuy count.
  const seasonByUser = new Map(
    (
      (seasonPlayersRes.data as
        | {
            user_id: string;
            starting_balance: number;
            current_balance: number;
            outstanding_debt: number;
            loan_count: number;
          }[]
        | null) ?? []
    ).map((row) => [row.user_id, row])
  );

  // Every group each player belongs to (multi-group membership). Falls back to
  // the legacy single primary group when the group_members table isn't there.
  const groupsByUser = new Map<string, string[]>();
  if (membersRes.error) {
    for (const p of profiles) {
      if (p.group_id) groupsByUser.set(p.id, [p.group_id]);
    }
  } else {
    for (const row of membersRes.data ?? []) {
      const list = groupsByUser.get(row.user_id) ?? [];
      list.push(row.group_id);
      groupsByUser.set(row.user_id, list);
    }
  }

  // A player is "active" when they placed a bet within the last 3 days.
  // All players are computed; the client decides whether to show inactive
  // ones (default view keeps the active-only rule).
  const activeCutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const isActivePlayer = (id: string) =>
    bets.some(
      (b) =>
        b.user_id === id && new Date(b.created_at).getTime() >= activeCutoff
    );

  const entries: LeaderboardEntry[] = profiles.map((p) => {
    const userBets = bets.filter((b) => b.user_id === p.id);
    const seasonRow = seasonByUser.get(p.id);
    const loanCount = seasonRow?.loan_count ?? 0;
    // All money figures are Season 2 only: starting/current balance and debt
    // come from season_players (fall back to the season base when the player
    // has no season row yet).
    const startingFund = Number(
      seasonRow?.starting_balance ?? SEASON2_STARTING_BALANCE
    );
    const currentBalance = Number(
      seasonRow?.current_balance ?? p.current_balance ?? startingFund
    );
    const totalBorrowed = seasonRow != null ? Number(seasonRow.outstanding_debt) : 0;
    const balanceHistory = [
      {
        balance: startingFund,
        net_balance: startingFund,
        outstanding_loan: 0,
        created_at: seasonStart ?? p.created_at,
      },
      ...history
        .filter((transaction) => transaction.user_id === p.id)
        .map((transaction) => {
          const outstandingLoan = debtAtFor(p.id, transaction.created_at);
          return {
            balance: transaction.balance_after,
            net_balance: transaction.balance_after - outstandingLoan,
            outstanding_loan: outstandingLoan,
            created_at: transaction.created_at,
          };
        }),
    ];
    const pendingStake = userBets
      .filter((bet) => bet.status === "pending")
      .reduce((sum, bet) => sum + bet.stake, 0);
    const netBalance = currentBalance + pendingStake - totalBorrowed;
    const won = userBets.filter((b) => classifyBetOutcome(b) === "won");
    const halfWon = userBets.filter((b) => classifyBetOutcome(b) === "half_won");
    const lost = userBets.filter((b) => classifyBetOutcome(b) === "lost");
    const halfLost = userBets.filter(
      (b) => classifyBetOutcome(b) === "half_lost"
    );
    const voidBets = userBets.filter((b) => classifyBetOutcome(b) === "void");
    const pending = userBets.filter((b) => b.status === "pending");
    const settled = won.length + halfWon.length + lost.length + halfLost.length;
    const winScore = won.length + halfWon.length * 0.5;
    const settledAscending = userBets
      .filter((bet) => bet.status !== "pending")
      .sort((a, b) => {
        // Order by when the bet was placed (a single coherent time basis)
        // so the result sequence — and the streaks derived from it — reflect
        // the real chronological order rather than admin settlement clicks.
        const byCreated =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return byCreated !== 0 ? byCreated : String(a.id).localeCompare(String(b.id));
      })
      .map((bet) => classifyBetOutcome(bet));
    const { longestWin, longestLoss } = computeStreaks(settledAscending);
    const recentResults = settledAscending.slice(-10).reverse();
    const netBalanceHistory = balanceHistory.map((point) => point.net_balance);
    const historicalHigh = parseFloat(
      Math.max(...netBalanceHistory, netBalance).toFixed(2)
    );
    const historicalLow = parseFloat(
      Math.min(...netBalanceHistory, netBalance).toFixed(2)
    );

    return {
      id: p.id,
      display_name: p.display_name,
      group_id: p.group_id,
      group_name: p.group_id ? groupNameById.get(p.group_id) ?? null : null,
      group_ids: groupsByUser.get(p.id) ?? [],
      current_balance: currentBalance,
      net_balance: netBalance,
      total_borrowed: totalBorrowed,
      pending_stake: pendingStake,
      starting_fund: startingFund,
      profit_loss: parseFloat((netBalance - startingFund).toFixed(2)),
      total_won: won.length + halfWon.length,
      total_lost: lost.length + halfLost.length,
      total_void: voidBets.length,
      total_pending: pending.length,
      win_rate: settled > 0 ? parseFloat((winScore / settled).toFixed(4)) : 0,
      total_stake: parseFloat(
        userBets.reduce((s, b) => s + b.stake, 0).toFixed(2)
      ),
      loan_count: loanCount,
      longest_win_streak: longestWin,
      longest_loss_streak: longestLoss,
      historical_high: historicalHigh,
      historical_low: historicalLow,
      is_active: isActivePlayer(p.id),
      recent_results: recentResults,
      balance_history: balanceHistory,
    };
  });

  entries.sort((a, b) => b.net_balance - a.net_balance);
  return { entries };
}
