"use server";

import { createClient } from "@/lib/supabase/server";
import type { LeaderboardEntry } from "@/lib/types";

export async function getLeaderboard(): Promise<{ entries: LeaderboardEntry[] }> {
  const supabase = await createClient();

  const [profilesRes, betsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, current_balance, starting_fund"),
    supabase
      .from("bets")
      .select("user_id, status, stake, payout, odds"),
  ]);

  const profiles = profilesRes.data ?? [];
  const bets = betsRes.data ?? [];

  const entries: LeaderboardEntry[] = profiles.map((p) => {
    const userBets = bets.filter((b) => b.user_id === p.id);
    const won = userBets.filter((b) => b.status === "won");
    const lost = userBets.filter((b) => b.status === "lost");
    const voidBets = userBets.filter((b) => b.status === "void");
    const pending = userBets.filter((b) => b.status === "pending");
    const settled = won.length + lost.length;

    return {
      id: p.id,
      display_name: p.display_name,
      current_balance: p.current_balance,
      starting_fund: p.starting_fund,
      profit_loss: parseFloat((p.current_balance - p.starting_fund).toFixed(2)),
      total_won: won.length,
      total_lost: lost.length,
      total_void: voidBets.length,
      total_pending: pending.length,
      win_rate: settled > 0 ? parseFloat((won.length / settled).toFixed(4)) : 0,
      total_stake: parseFloat(
        userBets.reduce((s, b) => s + b.stake, 0).toFixed(2)
      ),
    };
  });

  entries.sort((a, b) => b.current_balance - a.current_balance);
  return { entries };
}
