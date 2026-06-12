"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { LeaderboardEntry } from "@/lib/types";

export async function getLeaderboard(): Promise<{ entries: LeaderboardEntry[] }> {
  const supabase = await createClient();
  const service = createServiceClient();

  const [profilesRes, betsRes, loansRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, current_balance, starting_fund"),
    supabase
      .from("bets")
      .select("user_id, status, stake, payout, odds"),
    service
      .from("transactions")
      .select("user_id, amount, type")
      .is("bet_id", null)
      .in("type", ["loan", "adjustment"])
      .gt("amount", 0),
  ]);

  const profiles = profilesRes.data ?? [];
  const bets = betsRes.data ?? [];
  const loans = loansRes.data ?? [];

  const entries: LeaderboardEntry[] = profiles.map((p) => {
    const userBets = bets.filter((b) => b.user_id === p.id);
    const totalBorrowed = loans
      .filter((transaction) => transaction.user_id === p.id)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const netBalance = p.current_balance - totalBorrowed;
    const halfWon = userBets.filter(
      (b) =>
        b.status === "half_won" ||
        (b.status === "won" &&
          Math.abs(b.payout - (b.stake + (b.stake * (b.odds - 1)) / 2)) < 0.01)
    );
    const won = userBets.filter(
      (b) => b.status === "won" && !halfWon.includes(b)
    );
    const halfLost = userBets.filter(
      (b) => b.status === "half_lost" || (b.status === "lost" && b.payout > 0)
    );
    const lost = userBets.filter(
      (b) => b.status === "lost" && !halfLost.includes(b)
    );
    const voidBets = userBets.filter((b) => b.status === "void");
    const pending = userBets.filter((b) => b.status === "pending");
    const settled = won.length + halfWon.length + lost.length + halfLost.length;
    const winScore = won.length + halfWon.length * 0.5;

    return {
      id: p.id,
      display_name: p.display_name,
      current_balance: p.current_balance,
      net_balance: netBalance,
      total_borrowed: totalBorrowed,
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
    };
  });

  entries.sort((a, b) => b.net_balance - a.net_balance);
  return { entries };
}
