"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function settleBet(
  betId: string,
  result: "won" | "lost" | "void"
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

  // Fetch bet with profile balance
  const { data: bet } = await service
    .from("bets")
    .select("*, profiles(current_balance, display_name)")
    .eq("id", betId)
    .single();

  if (!bet) return { error: "找不到此投注記錄" };
  if (bet.status !== "pending") return { error: `此投注已結算（${bet.status}）` };

  const currentBalance = (bet.profiles as { current_balance: number }).current_balance;

  let payout = 0;
  let balanceDelta = 0;
  let txType: "payout" | "refund" = "payout";

  if (result === "won") {
    payout = parseFloat((bet.odds * bet.stake).toFixed(2));
    balanceDelta = payout;
    txType = "payout";
  } else if (result === "void") {
    payout = bet.stake;
    balanceDelta = bet.stake;
    txType = "refund";
  }

  const newBalance = parseFloat((currentBalance + balanceDelta).toFixed(2));

  // Update bet
  const { error: betErr } = await service
    .from("bets")
    .update({ status: result, payout, settled_at: new Date().toISOString() })
    .eq("id", betId);

  if (betErr) return { error: betErr.message };

  // Update balance if needed
  if (balanceDelta > 0) {
    await service
      .from("profiles")
      .update({ current_balance: newBalance })
      .eq("id", bet.user_id);

    await service.from("transactions").insert({
      user_id: bet.user_id,
      bet_id: betId,
      type: txType,
      amount: balanceDelta,
      balance_after: newBalance,
    });
  }

  revalidatePath("/admin/settle");
  revalidatePath("/bets-board");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");

  return {
    success: true,
    result,
    payout,
    newBalance: balanceDelta > 0 ? newBalance : currentBalance,
    stake: bet.stake,
    playerName: (bet.profiles as { display_name: string }).display_name,
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
