"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { BetStatus } from "@/lib/types";

type SettlementResult = Exclude<BetStatus, "pending">;

export async function settleBet(
  betId: string,
  result: SettlementResult
) {
  const supabase = await createClient();
  const service = createServiceClient();

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (adminProfile?.role !== "admin") return { error: "權限不足" };

  const { data, error } = await service.rpc("settle_bet", {
    p_bet_id: betId,
    p_result: result,
  });

  if (error && error.code !== "PGRST202") return { error: error.message };

  let settlement = data as {
    payout: number;
    new_balance: number;
    stake: number;
    player_name: string;
  } | null;

  // Compatibility path until the settlement migration is applied.
  if (!settlement) {
    const { data: bet } = await service
      .from("bets")
      .select("*, profiles(current_balance, display_name)")
      .eq("id", betId)
      .single();

    if (!bet) return { error: "找不到此投注記錄" };
    if (bet.status !== "pending") return { error: `此投注已結算（${bet.status}）` };

    const profile = bet.profiles as {
      current_balance: number;
      display_name: string;
    };
    const payout = parseFloat(
      (result === "won"
        ? bet.stake * bet.odds
        : result === "half_won"
        ? bet.stake + (bet.stake * (bet.odds - 1)) / 2
        : result === "half_lost"
        ? bet.stake / 2
        : result === "void"
        ? bet.stake
        : 0
      ).toFixed(2)
    );
    const storedStatus =
      result === "half_won" ? "won" : result === "half_lost" ? "lost" : result;
    const newBalance = parseFloat((profile.current_balance + payout).toFixed(2));

    const { error: betError } = await service
      .from("bets")
      .update({
        status: storedStatus,
        payout,
        settled_at: new Date().toISOString(),
      })
      .eq("id", betId)
      .eq("status", "pending");

    if (betError) return { error: betError.message };

    if (payout > 0) {
      const { error: profileError } = await service
        .from("profiles")
        .update({ current_balance: newBalance })
        .eq("id", bet.user_id);
      if (profileError) return { error: profileError.message };

      const { error: transactionError } = await service
        .from("transactions")
        .insert({
          user_id: bet.user_id,
          bet_id: betId,
          type: result === "void" || result === "half_lost" ? "refund" : "payout",
          amount: payout,
          balance_after: newBalance,
        });
      if (transactionError) return { error: transactionError.message };
    }

    settlement = {
      payout,
      new_balance: newBalance,
      stake: bet.stake,
      player_name: profile.display_name,
    };
  }

  revalidatePath("/admin/settle");
  revalidatePath("/bets-board");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");

  return {
    success: true,
    result,
    payout: settlement.payout,
    newBalance: settlement.new_balance,
    stake: settlement.stake,
    playerName: settlement.player_name,
  };
}

export async function getAllBetsForAdmin(statusFilter = "all") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { bets: [] };

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (adminProfile?.role !== "admin") return { bets: [] };

  let query = supabase
    .from("bets")
    .select(
      "*, profiles(display_name, current_balance), matches(home_team, away_team, kickoff_time, stage)"
    )
    .order("created_at", { ascending: false });

  if (statusFilter !== "all") query = query.eq("status", statusFilter);

  const { data } = await query;
  return { bets: data ?? [] };
}
