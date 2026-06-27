"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { calculateLoanBalance } from "@/lib/loans";
import type { BetStatus, LeaderboardEntry } from "@/lib/types";

type SettlementBet = {
  bet_type: string;
  status: string;
  stake: number;
  payout: number;
  odds: number;
};

// Effective outcome of a settled bet for stats/streak purposes.
// 過關 (parlay) is judged by its net result: a parlay that does not profit
// counts as a loss even if no single leg fully lost. Single bets keep the
// payout-based half-win / half-loss detection.
function classifyBetOutcome(bet: SettlementBet): BetStatus {
  if (bet.status === "pending") return "pending";

  if (bet.bet_type === "過關") {
    if (bet.status === "void") return "void";
    const diff = bet.payout - bet.stake;
    if (diff > 0.01) return "won";
    if (diff < -0.01) return "lost";
    return "void";
  }

  if (bet.status === "won") {
    const halfWinPayout = bet.stake + (bet.stake * (bet.odds - 1)) / 2;
    return Math.abs(bet.payout - halfWinPayout) < 0.01 ? "half_won" : "won";
  }

  if (bet.status === "lost") {
    return bet.payout > 0 ? "half_lost" : "lost";
  }

  return bet.status as BetStatus;
}

// Longest consecutive win/loss streaks from chronologically ordered results.
// won/half_won count as wins, lost/half_lost as losses. Anything else (走盤 /
// void) breaks both streaks so a push interrupts a run rather than bridging it.
function computeStreaks(statusesAscending: string[]) {
  let longestWin = 0;
  let longestLoss = 0;
  let currentWin = 0;
  let currentLoss = 0;

  for (const status of statusesAscending) {
    if (status === "won" || status === "half_won") {
      currentWin += 1;
      currentLoss = 0;
      if (currentWin > longestWin) longestWin = currentWin;
    } else if (status === "lost" || status === "half_lost") {
      currentLoss += 1;
      currentWin = 0;
      if (currentLoss > longestLoss) longestLoss = currentLoss;
    } else {
      currentWin = 0;
      currentLoss = 0;
    }
  }

  return { longestWin, longestLoss };
}

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

  const [profilesRes, betsRes, loansRes, historyRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, current_balance, starting_fund, created_at"),
    supabase
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
  ]);

  const profiles = profilesRes.data ?? [];
  const bets = betsRes.data ?? [];
  const loans = loansRes.data ?? [];
  const history = historyRes.data ?? [];

  const entries: LeaderboardEntry[] = profiles.map((p) => {
    const userBets = bets.filter((b) => b.user_id === p.id);
    const totalBorrowed = calculateLoanBalance(
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

    return {
      id: p.id,
      display_name: p.display_name,
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
      longest_win_streak: longestWin,
      longest_loss_streak: longestLoss,
      recent_results: recentResults,
      balance_history: balanceHistory,
    };
  });

  entries.sort((a, b) => b.net_balance - a.net_balance);
  return { entries };
}
