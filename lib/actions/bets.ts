"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { BetType } from "@/lib/types";
import { isMatchBettable, BETTING_CLOSED_MESSAGE } from "@/lib/match-status";
import { validateStake } from "@/lib/season2-loans";
import { getActiveSeason } from "@/lib/seasons";

// Outstanding Season 2 debt for a user (0 when no season_players row yet).
async function getActiveSeasonDebt(
  service: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<number> {
  const { data } = await service
    .from("season_players")
    .select("outstanding_debt")
    .eq("user_id", userId)
    .eq("season_id", getActiveSeason().id)
    .maybeSingle();
  return Number(data?.outstanding_debt ?? 0);
}
import {
  getParlayPossibleReturn,
  PARLAY_BET_TYPE,
  serializeParlay,
  type ParlayLeg,
} from "@/lib/parlay";

export type ParlayLegInput = {
  match_id: string;
  bet_type: Exclude<BetType, "過關">;
  selection: string;
  odds: number;
};

export async function createBet(formData: FormData) {
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const match_id = formData.get("match_id") as string;
  const bet_type = formData.get("bet_type") as BetType;
  const selection = (formData.get("selection") as string)?.trim();
  const odds = parseFloat(formData.get("odds") as string);
  const stake = parseFloat(formData.get("stake") as string);

  if (!match_id) return { error: "請選擇賽事" };
  if (!bet_type) return { error: "請選擇投注類型" };
  if (!selection) return { error: "請填寫投注選項" };
  if (isNaN(odds) || odds <= 1) return { error: "賠率必須大於 1" };
  if (isNaN(stake) || stake <= 0) return { error: "投注額必須大於 0" };

  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("kickoff_time, status, home_team, away_team")
    .eq("id", match_id)
    .single();

  if (matchErr || !match) return { error: "找不到此賽事" };
  if (!isMatchBettable(match)) {
    return { error: BETTING_CLOSED_MESSAGE };
  }

  // Check balance + Season 2 debt restrictions.
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_balance")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "找不到用戶資料" };

  const outstandingDebt = await getActiveSeasonDebt(service, user.id);
  const stakeError = validateStake({
    stake,
    currentBalance: profile.current_balance,
    outstandingDebt,
    isParlay: false,
  });
  if (stakeError) return { error: stakeError };

  const possible_return = parseFloat((odds * stake).toFixed(2));
  const new_balance = parseFloat((profile.current_balance - stake).toFixed(2));

  // Insert bet
  const { data: bet, error: betErr } = await service
    .from("bets")
    .insert({
      user_id: user.id,
      match_id,
      bet_type,
      selection,
      odds,
      stake,
      possible_return,
      status: "pending",
    })
    .select()
    .single();

  if (betErr) return { error: betErr.message };

  // Deduct balance
  await service
    .from("profiles")
    .update({ current_balance: new_balance })
    .eq("id", user.id);

  // Record transaction
  await service.from("transactions").insert({
    user_id: user.id,
    bet_id: bet.id,
    type: "stake_deduct",
    amount: -stake,
    balance_after: new_balance,
  });

  revalidatePath("/dashboard");
  revalidatePath("/bets-board");

  return { success: true, bet, new_balance, possible_return };
}

export async function createParlay(legsInput: ParlayLegInput[], stakeInput: number) {
  const supabase = await createClient();
  const service = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "未登入" };
  if (legsInput.length < 2 || legsInput.length > 10) {
    return { error: "過關必須包含 2 至 10 關" };
  }

  const stake = Math.round(Number(stakeInput) * 100) / 100;
  if (!Number.isFinite(stake) || stake <= 0) {
    return { error: "投注額必須大於 0" };
  }

  const matchIds = legsInput.map((leg) => leg.match_id);
  if (new Set(matchIds).size !== matchIds.length) {
    return { error: "同一場賽事不可重複加入過關" };
  }

  for (const leg of legsInput) {
    if (
      !leg.match_id ||
      !leg.bet_type ||
      !leg.selection.trim() ||
      !Number.isFinite(leg.odds) ||
      leg.odds <= 1
    ) {
      return { error: "請完整填寫每一關的投注資料" };
    }
  }

  const [{ data: matches, error: matchesError }, { data: profile }] =
    await Promise.all([
      service
        .from("matches")
        .select("id, home_team, away_team, kickoff_time, status")
        .in("id", matchIds),
      service
        .from("profiles")
        .select("current_balance")
        .eq("id", user.id)
        .single(),
    ]);

  if (matchesError || !matches || matches.length !== legsInput.length) {
    return { error: "部分賽事不存在" };
  }
  if (!profile) return { error: "找不到玩家資料" };

  const outstandingDebt = await getActiveSeasonDebt(service, user.id);
  const parlayStakeError = validateStake({
    stake,
    currentBalance: profile.current_balance,
    outstandingDebt,
    isParlay: true,
  });
  if (parlayStakeError) return { error: parlayStakeError };

  const matchMap = new Map(matches.map((match) => [match.id, match]));
  const legs: ParlayLeg[] = legsInput.map((input, index) => {
    const match = matchMap.get(input.match_id)!;
    return {
      id: `${Date.now()}-${index}`,
      match_id: input.match_id,
      home_team: match.home_team,
      away_team: match.away_team,
      kickoff_time: match.kickoff_time,
      bet_type: input.bet_type,
      selection: input.selection.trim(),
      odds: Math.round(input.odds * 100) / 100,
      status: "pending",
    };
  });

  const invalidMatch = legs.find((leg) => {
    const match = matchMap.get(leg.match_id)!;
    return !isMatchBettable(match);
  });
  if (invalidMatch) {
    return {
      error: `${invalidMatch.home_team} 對 ${invalidMatch.away_team}：${BETTING_CLOSED_MESSAGE}`,
    };
  }

  const totalOdds = Math.round(
    legs.reduce((product, leg) => product * leg.odds, 1) * 10000
  ) / 10000;
  const possibleReturn = getParlayPossibleReturn(stake, legs);
  const newBalance =
    Math.round((profile.current_balance - stake) * 100) / 100;

  const { data: bet, error: betError } = await service
    .from("bets")
    .insert({
      user_id: user.id,
      match_id: legs[0].match_id,
      bet_type: PARLAY_BET_TYPE,
      selection: serializeParlay({ version: 1, legs }),
      odds: totalOdds,
      stake,
      possible_return: possibleReturn,
      status: "pending",
    })
    .select()
    .single();

  if (betError || !bet) return { error: betError?.message ?? "建立過關失敗" };

  const { data: updatedProfile, error: balanceError } = await service
    .from("profiles")
    .update({ current_balance: newBalance })
    .eq("id", user.id)
    .eq("current_balance", profile.current_balance)
    .select("current_balance")
    .single();

  if (balanceError || !updatedProfile) {
    await service.from("bets").delete().eq("id", bet.id);
    return { error: balanceError?.message ?? "餘額剛被更新，請重試" };
  }

  const { error: transactionError } = await service.from("transactions").insert({
    user_id: user.id,
    bet_id: bet.id,
    type: "stake_deduct",
    amount: -stake,
    balance_after: newBalance,
  });

  if (transactionError) {
    await service
      .from("profiles")
      .update({ current_balance: profile.current_balance })
      .eq("id", user.id)
      .eq("current_balance", newBalance);
    await service.from("bets").delete().eq("id", bet.id);
    return { error: transactionError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/bets-board");
  revalidatePath("/leaderboard");

  return {
    success: true,
    bet,
    new_balance: newBalance,
    possible_return: possibleReturn,
    total_odds: totalOdds,
  };
}

export async function getPublicBets(filters?: {
  match_id?: string;
  user_id?: string;
  status?: string;
  bet_type?: string;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("bets")
    .select(
      "*, profiles(display_name), matches(home_team, away_team, kickoff_time, stage)"
    )
    .order("created_at", { ascending: false });

  if (filters?.match_id) query = query.eq("match_id", filters.match_id);
  if (filters?.user_id) query = query.eq("user_id", filters.user_id);
  if (filters?.status && filters.status !== "all")
    query = query.eq("status", filters.status);
  if (filters?.bet_type && filters.bet_type !== "all")
    query = query.eq("bet_type", filters.bet_type);

  const { data, error } = await query;
  if (error) return { bets: [], error: error.message };
  return { bets: data ?? [] };
}

export async function getUserBets(limit = 20) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { bets: [] };

  const { data } = await supabase
    .from("bets")
    .select(
      "*, matches(home_team, away_team, kickoff_time, stage, status, score_home, score_away)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return { bets: data ?? [] };
}
