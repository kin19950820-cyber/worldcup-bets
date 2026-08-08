"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { calculateLoanBalance } from "@/lib/loans";
import { classifyBetOutcome, computeStreaks } from "@/lib/bet-stats";
import { getActiveSeason, getSeason } from "@/lib/seasons";
import type { LeaderboardEntry } from "@/lib/types";

const FUND_TREND_TRANSACTION_TYPES = [
  "initial_fund",
  "payout",
  "refund",
  "loan",
  "adjustment",
  "loan_repayment",
  "loan_principal",
  "debt_repayment",
];

type SeasonPlayerRow = {
  user_id: string;
  starting_balance: number;
  current_balance: number;
  outstanding_debt: number;
  loan_count: number;
};

export async function getLeaderboard(
  seasonId: number = getActiveSeason().id
): Promise<{ entries: LeaderboardEntry[] }> {
  const supabase = await createClient();
  const service = createServiceClient();

  const season = getSeason(seasonId) ?? getActiveSeason();
  const isActiveSeason = !season.ended;

  const [profilesRes, betsRes, loansRes, historyRes, seasonPlayersRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, display_name, current_balance, starting_fund, created_at, group_id, groups(name)"
        ),
      supabase
        .from("bets")
        .select(
          "id, user_id, bet_type, status, stake, payout, odds, created_at, settled_at"
        )
        .eq("season_id", seasonId),
      service
        .from("transactions")
        .select("user_id, amount, type, created_at")
        .is("bet_id", null)
        .in("type", ["loan", "adjustment", "loan_repayment"])
        .eq("season_id", seasonId)
        .order("created_at", { ascending: true }),
      service
        .from("transactions")
        .select("user_id, amount, type, balance_after, created_at")
        .in("type", FUND_TREND_TRANSACTION_TYPES)
        .eq("season_id", seasonId)
        .order("created_at", { ascending: true }),
      service
        .from("season_players")
        .select(
          "user_id, starting_balance, current_balance, outstanding_debt, loan_count"
        )
        .eq("season_id", seasonId),
    ]);

  const profiles = profilesRes.data ?? [];
  const bets = betsRes.data ?? [];
  const loans = loansRes.data ?? [];
  const history = historyRes.data ?? [];
  const seasonPlayers = new Map(
    ((seasonPlayersRes.data as SeasonPlayerRow[] | null) ?? []).map((row) => [
      row.user_id,
      row,
    ])
  );

  // A player is "active" when they placed a bet within the last 3 days (only
  // meaningful for the ongoing season).
  const activeCutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const isActivePlayer = (id: string) =>
    bets.some(
      (b) => b.user_id === id && new Date(b.created_at).getTime() >= activeCutoff
    );

  // Players with any presence in this season: a season_players row or a bet.
  const seasonUserIds = new Set<string>([
    ...seasonPlayers.keys(),
    ...bets.map((b) => b.user_id),
  ]);

  const entries: LeaderboardEntry[] = profiles
    .filter((p) => seasonUserIds.size === 0 || seasonUserIds.has(p.id))
    .map((p) => {
      const sp = seasonPlayers.get(p.id);
      const userBets = bets.filter((b) => b.user_id === p.id);

      // Balance / debt / loan sources are season-aware:
      //  * active season → season_players (flat Season 2 debt model)
      //  * closed season → snapshot balance + tiered ledger debt (unchanged S1)
      const startingBalance = sp?.starting_balance ?? p.starting_fund;
      const currentBalance = sp?.current_balance ?? p.current_balance;
      const seasonLoans = loans.filter((t) => t.user_id === p.id);
      const totalBorrowed = isActiveSeason
        ? Number(sp?.outstanding_debt ?? 0)
        : calculateLoanBalance(seasonLoans).totalOwed;
      const loanCount = sp?.loan_count ?? 0;

      const balanceHistory = [
        {
          balance: startingBalance,
          net_balance: startingBalance,
          outstanding_loan: 0,
          created_at: p.created_at,
        },
        ...history
          .filter((transaction) => transaction.user_id === p.id)
          .map((transaction) => {
            const outstandingLoan = isActiveSeason
              ? totalBorrowed
              : calculateLoanBalance(
                  seasonLoans.filter(
                    (loanTransaction) =>
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
          const byCreated =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          return byCreated !== 0
            ? byCreated
            : String(a.id).localeCompare(String(b.id));
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

      const groups = p.groups as unknown as
        | { name: string }[]
        | { name: string }
        | null;
      const group = Array.isArray(groups) ? groups[0] ?? null : groups;

      return {
        id: p.id,
        display_name: p.display_name,
        group_id: p.group_id,
        group_name: group?.name ?? null,
        current_balance: currentBalance,
        net_balance: parseFloat(netBalance.toFixed(2)),
        total_borrowed: parseFloat(Number(totalBorrowed).toFixed(2)),
        pending_stake: pendingStake,
        starting_fund: startingBalance,
        profit_loss: parseFloat((netBalance - startingBalance).toFixed(2)),
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

  // Tie-break: net worth ↓, outstanding debt ↑, loans used ↑, ROI ↓, bets ↑.
  const roi = (e: LeaderboardEntry) =>
    e.total_stake > 0 ? e.profit_loss / e.total_stake : 0;
  const betCount = (e: LeaderboardEntry) =>
    e.total_won + e.total_lost + e.total_void + e.total_pending;
  entries.sort(
    (a, b) =>
      b.net_balance - a.net_balance ||
      a.total_borrowed - b.total_borrowed ||
      a.loan_count - b.loan_count ||
      roi(b) - roi(a) ||
      betCount(a) - betCount(b)
  );

  return { entries };
}
