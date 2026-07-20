// Shared bet-outcome classification and streak computation, used by the
// leaderboard and the hall of fame.

import type { BetStatus } from "@/lib/types";

export type SettlementBet = {
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
export function classifyBetOutcome(bet: SettlementBet): BetStatus {
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
export function computeStreaks(statusesAscending: string[]) {
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
