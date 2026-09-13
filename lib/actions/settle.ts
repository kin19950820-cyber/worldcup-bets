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

function payoutForResult(
  stake: number,
  odds: number,
  result: SettlementResult
) {
  return parseFloat(
    (result === "won"
      ? stake * odds
      : result === "half_won"
      ? stake + (stake * (odds - 1)) / 2
      : result === "half_lost"
      ? stake / 2
      : result === "void"
      ? stake
      : 0
    ).toFixed(2)
  );
}

function transactionTypeForSettlement(
  result: SettlementResult,
  delta: number
) {
  if (delta < 0) return "adjustment";
  return result === "void" || result === "half_lost" ? "refund" : "payout";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Credits a settlement delta to the player's AUTHORITATIVE season balance
// (season_players.current_balance), mirroring it to profiles and tagging the
// transaction with the season — matching settle_bet_season2. A positive payout
// repays outstanding debt first, remainder becomes cash. Used by parlay
// leg-settlement and re-settlement, which previously only touched the profiles
// mirror and so never reached the real balance the leaderboard reads.
async function applySettlementBalanceDelta({
  service,
  userId,
  betId,
  seasonId,
  delta,
  result,
}: {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  betId: string;
  seasonId: number | null | undefined;
  delta: number;
  result: SettlementResult;
}) {
  const roundedDelta = round2(delta);

  const { data: sp } = seasonId
    ? await service
        .from("season_players")
        .select("current_balance, outstanding_debt")
        .eq("user_id", userId)
        .eq("season_id", seasonId)
        .maybeSingle()
    : { data: null };

  // Legacy fallback: no season row (Season 1) — update the profiles mirror.
  if (!sp || seasonId == null) {
    const { data: profile } = await service
      .from("profiles")
      .select("current_balance")
      .eq("id", userId)
      .single();
    const base = Number(profile?.current_balance ?? 0);
    const newBalance = round2(base + roundedDelta);
    if (roundedDelta === 0) return { newBalance };
    const { data: updated, error: profileError } = await service
      .from("profiles")
      .update({ current_balance: newBalance })
      .eq("id", userId)
      .eq("current_balance", base)
      .select("current_balance")
      .single();
    if (profileError || !updated) {
      return { error: profileError?.message ?? "玩家餘額剛被更新，請重試" };
    }
    const { error: txError } = await service.from("transactions").insert({
      user_id: userId,
      bet_id: betId,
      type: transactionTypeForSettlement(result, roundedDelta),
      amount: roundedDelta,
      balance_after: newBalance,
    });
    if (txError) {
      await service
        .from("profiles")
        .update({ current_balance: base })
        .eq("id", userId)
        .eq("current_balance", newBalance);
      return { error: txError.message };
    }
    return { newBalance };
  }

  const oldBalance = Number(sp.current_balance);
  const oldDebt = Number(sp.outstanding_debt);
  if (roundedDelta === 0) return { newBalance: oldBalance };

  // Debt-first repayment for positive payouts (matches settle_bet_season2).
  const repaid =
    roundedDelta > 0 ? round2(Math.min(roundedDelta, oldDebt)) : 0;
  const cash = round2(roundedDelta - repaid);
  const newDebt = round2(oldDebt - repaid);
  const newBalance = round2(oldBalance + cash);

  const { data: updatedSp, error: spError } = await service
    .from("season_players")
    .update({
      current_balance: newBalance,
      outstanding_debt: newDebt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .eq("current_balance", oldBalance)
    .select("current_balance")
    .single();

  if (spError || !updatedSp) {
    return { error: spError?.message ?? "玩家餘額剛被更新，請重試" };
  }
  await service
    .from("profiles")
    .update({ current_balance: newBalance })
    .eq("id", userId);

  const rollback = async () => {
    await service
      .from("season_players")
      .update({ current_balance: oldBalance, outstanding_debt: oldDebt })
      .eq("user_id", userId)
      .eq("season_id", seasonId)
      .eq("current_balance", newBalance);
    await service
      .from("profiles")
      .update({ current_balance: oldBalance })
      .eq("id", userId);
  };

  if (cash !== 0) {
    const { error: txError } = await service.from("transactions").insert({
      user_id: userId,
      bet_id: betId,
      season_id: seasonId,
      type: transactionTypeForSettlement(result, cash),
      amount: cash,
      balance_after: newBalance,
    });
    if (txError) {
      await rollback();
      return { error: txError.message };
    }
  }
  if (repaid !== 0) {
    await service.from("transactions").insert({
      user_id: userId,
      bet_id: betId,
      season_id: seasonId,
      type: "debt_repayment",
      amount: round2(-repaid),
      balance_after: newBalance,
    });
  }

  return { newBalance };
}

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

  const { data: existingBet } = await service
    .from("bets")
    .select("*, profiles(current_balance, display_name)")
    .eq("id", betId)
    .single();

  if (!existingBet) return { error: "找不到此投注記錄" };

  if (existingBet.status !== "pending") {
    const profile = existingBet.profiles as {
      current_balance: number;
      display_name: string;
    };
    const payout = payoutForResult(existingBet.stake, existingBet.odds, result);
    const previousPayout = Number(existingBet.payout) || 0;
    const delta = payout - previousPayout;
    const { error: betError } = await service
      .from("bets")
      .update({
        status: result,
        payout,
        settled_at: new Date().toISOString(),
      })
      .eq("id", betId);

    if (betError) return { error: betError.message };

    const balanceResult = await applySettlementBalanceDelta({
      service,
      userId: existingBet.user_id,
      betId,
      seasonId: existingBet.season_id,
      delta,
      result,
    });

    if ("error" in balanceResult && balanceResult.error) {
      await service
        .from("bets")
        .update({
          status: existingBet.status,
          payout: existingBet.payout,
          settled_at: existingBet.settled_at,
        })
        .eq("id", betId);
      return { error: balanceResult.error };
    }

    revalidatePath("/admin/settle");
    revalidatePath("/bets-board");
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");

    return {
      success: true,
      changed: true,
      result,
      payout,
      newBalance: balanceResult.newBalance,
      stake: existingBet.stake,
      playerName: profile.display_name,
    };
  }

  // Season 2: debt-first repayment happens atomically inside the RPC. Falls
  // back to the legacy path only until the phase-2 migration is applied.
  const { data, error } = await service.rpc("settle_bet_season2", {
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
    const payout = payoutForResult(bet.stake, bet.odds, result);
    const storedStatus = result;
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

  const payload = parseParlay(bet.selection);
  if (!payload) return { error: "過關資料格式錯誤" };

  const leg = payload.legs.find((item) => item.id === legId);
  if (!leg) return { error: "找不到此關" };

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
    .eq("status", bet.status)
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

  if (settlement.complete) {
    const previousPayout = Number(bet.payout) || 0;
    const balanceResult = await applySettlementBalanceDelta({
      service,
      userId: bet.user_id,
      betId,
      seasonId: bet.season_id,
      delta: settlement.payout - previousPayout,
      result: settlement.status === "pending" ? result : settlement.status,
    });

    if ("error" in balanceResult && balanceResult.error) {
      await service
        .from("bets")
        .update({
          selection: bet.selection,
          status: bet.status,
          payout: bet.payout,
          settled_at: bet.settled_at,
        })
        .eq("id", betId);
      return { error: balanceResult.error };
    }

    newBalance = balanceResult.newBalance ?? newBalance;
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
