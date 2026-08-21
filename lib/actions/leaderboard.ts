"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { calculateLoanBalance } from "@/lib/loans";
import { classifyBetOutcome, computeStreaks } from "@/lib/bet-stats";
import { getActiveSeason } from "@/lib/seasons";
import type { LeaderboardEntry } from "@/lib/types";

const FUND_TREND_TRANSACTION_TYPES = [
  "initial_fund",
  "payout",
  "refund",
  "loan",
  "adjustment",
  "loan_repayment",
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

  const [
    profilesRes,
    betsRes,
    loansRes,
    historyRes,
    membersRes,
    seasonPlayersRes,
  ] = await Promise.all([
      service
        .from("profiles")
        .select(
          "id, display_name, current_balance, starting_fund, created_at, group_id, groups(name)"
        ),
      service
        .from("bets")
        .select("id, user_id, bet_type, status, stake, payout, odds, created_at, settled_at"),
      service
        .from("transactions")
        .select("user_id, amount, type, created_at")
        .is("bet_id", null)
        .in("type", ["loan", "adjustment", "loan_repayment"])
        .order("created_at", { ascending: true }),
      service
        .from("transactions")
        .select("user_id, amount, type, balance_after, created_at")
        .in("type", FUND_TREND_TRANSACTION_TYPES)
        .order("created_at", { ascending: true }),
      service.from("group_members").select("group_id, user_id"),
      service
        .from("season_players")
        .select("user_id, outstanding_debt, loan_count")
        .eq("season_id", getActiveSeason().id),
    ]);

  const profiles = profilesRes.data ?? [];
  const bets = betsRes.data ?? [];
  const loans = loansRes.data ?? [];
  const history = historyRes.data ?? [];

  // Active-season debt + rebuy (loan) count from season_players.
  const seasonByUser = new Map(
    (
      (seasonPlayersRes.data as
        | { user_id: string; outstanding_debt: number; loan_count: number }[]
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
    // Season 2 debt (flat model) comes from season_players; fall back to the
    // legacy tiered ledger when there is no season row.
    const totalBorrowed =
      seasonRow != null
        ? Number(seasonRow.outstanding_debt)
        : calculateLoanBalance(
            loans.filter((transaction) => transaction.user_id === p.id)
          ).totalOwed;
    const balanceHistory = [
      {
        balance: p.starting_fund,
        net_balance: p.starting_fund,
        outstanding_loan: 0,
        created_at: p.created_at,
      },
      ...history
        .filter((transaction) => transaction.user_id === p.id)
        .map((transaction) => {
          const outstandingLoan = calculateLoanBalance(
            loans.filter(
              (loanTransaction) =>
                loanTransaction.user_id === p.id &&
                new Date(loanTransaction.created_at).getTime() <=
                  new Date(transaction.created_at).getTime()
            ),
            new Date(transaction.created_at)
          ).totalOwed;

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
    const netBalance = p.current_balance + pendingStake - totalBorrowed;
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

    const groups = p.groups as unknown as { name: string }[] | { name: string } | null;
    const group = Array.isArray(groups) ? groups[0] ?? null : groups;

    return {
      id: p.id,
      display_name: p.display_name,
      group_id: p.group_id,
      group_name: group?.name ?? null,
      group_ids: groupsByUser.get(p.id) ?? [],
      current_balance: p.current_balance,
      net_balance: netBalance,
      total_borrowed: totalBorrowed,
      pending_stake: pendingStake,
      starting_fund: p.starting_fund,
      profit_loss: parseFloat((netBalance - p.starting_fund).toFixed(2)),
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
