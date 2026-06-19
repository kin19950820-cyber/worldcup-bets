"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { BetStatus } from "@/lib/types";
import {
  getParlaySettlement,
  parseParlay,
  serializeParlay,
} from "@/lib/parlay";

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

export async function settleParlayLeg(
  betId: string,
  legId: string,
  result: SettlementResult
) {
  const supabase = await createClient();
  const service = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "未登入" };

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (adminProfile?.role !== "admin") return { error: "權限不足" };

  const { data: bet } = await service
    .from("bets")
    .select("*, profiles(current_balance, display_name)")
    .eq("id", betId)
    .single();

  if (!bet) return { error: "找不到此過關投注" };
  if (bet.status !== "pending") return { error: "此過關已經結算" };

  const payload = parseParlay(bet.selection);
  if (!payload) return { error: "過關資料格式錯誤" };

  const leg = payload.legs.find((item) => item.id === legId);
  if (!leg) return { error: "找不到此關" };
  if (leg.status !== "pending") return { error: "此關已經結算" };

  leg.status = result;
  const settlement = getParlaySettlement(bet.stake, payload.legs);
  const nextSelection = serializeParlay(payload);
  const updatePayload: Record<string, unknown> = {
    selection: nextSelection,
  };

  if (settlement.complete) {
    updatePayload.status = settlement.status;
    updatePayload.payout = settlement.payout;
    updatePayload.settled_at = new Date().toISOString();
  }

  const { data: updatedBet, error: updateError } = await service
    .from("bets")
    .update(updatePayload)
    .eq("id", betId)
    .eq("status", "pending")
    .eq("selection", bet.selection)
    .select("id")
    .single();

  if (updateError || !updatedBet) {
    return { error: updateError?.message ?? "此過關剛被其他人更新，請重試" };
  }

  const profile = bet.profiles as {
    current_balance: number;
    display_name: string;
  };
  let newBalance = profile.current_balance;

  if (settlement.complete && settlement.payout > 0) {
    newBalance =
      Math.round((profile.current_balance + settlement.payout) * 100) / 100;

    const { data: updatedProfile, error: profileError } = await service
      .from("profiles")
      .update({ current_balance: newBalance })
      .eq("id", bet.user_id)
      .eq("current_balance", profile.current_balance)
      .select("current_balance")
      .single();
    if (profileError || !updatedProfile) {
      await service
        .from("bets")
        .update({
          selection: bet.selection,
          status: "pending",
          payout: 0,
          settled_at: null,
        })
        .eq("id", betId);
      return { error: profileError?.message ?? "玩家餘額剛被更新，請重試" };
    }

    const { error: transactionError } = await service
      .from("transactions")
      .insert({
        user_id: bet.user_id,
        bet_id: betId,
        type: settlement.status === "void" ? "refund" : "payout",
        amount: settlement.payout,
        balance_after: newBalance,
      });
    if (transactionError) {
      await service
        .from("profiles")
        .update({ current_balance: profile.current_balance })
        .eq("id", bet.user_id)
        .eq("current_balance", newBalance);
      await service
        .from("bets")
        .update({
          selection: bet.selection,
          status: "pending",
          payout: 0,
          settled_at: null,
        })
        .eq("id", betId);
      return { error: transactionError.message };
    }
  }

  revalidatePath("/admin/settle");
  revalidatePath("/bets-board");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");

  return {
    success: true,
    complete: settlement.complete,
    status: settlement.status,
    payout: settlement.payout,
    newBalance,
    playerName: profile.display_name,
    legs: payload.legs,
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
