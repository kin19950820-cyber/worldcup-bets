"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { BetType } from "@/lib/types";
import { isMatchBettable, BETTING_CLOSED_MESSAGE } from "@/lib/match-status";
import {
  getParlayPossibleReturn,
  serializeParlay,
  type ParlayLeg,
} from "@/lib/parlay";

const BET_RPC_ERRORS: Record<string, string> = {
  SEASON_PLAYER_MISSING: "找不到本季玩家資料",
  SEASON_CLOSED: "本季已結束",
  MATCH_NOT_FOUND: "找不到賽事",
  MATCH_WRONG_SEASON: "此賽事不屬於目前賽季",
  BETTING_CLOSED: BETTING_CLOSED_MESSAGE,
  BAD_ODDS: "賠率必須大於 1",
  BAD_STAKE: "投注金額必須大於 0",
  DEBT_STAKE_LIMIT: "欠款期間單注上限為 $100",
  DEBT_NO_PARLAY: "欠款期間不可投注過關",
  INSUFFICIENT_BALANCE: "餘額不足",
};

function mapBetRpcError(message: string | undefined) {
  if (!message) return "投注失敗，請稍後再試";
  const code = Object.keys(BET_RPC_ERRORS).find((key) => message.includes(key));
  if (code) return BET_RPC_ERRORS[code];
  if (message.includes("PGRST202")) return "投注功能尚未完成資料庫設定";
  return message;
}

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

  const possible_return = parseFloat((odds * stake).toFixed(2));
  const { data, error } = await service.rpc("place_single_bet", {
    p_user_id: user.id,
    p_match_id: match_id,
    p_bet_type: bet_type,
    p_selection: selection,
    p_odds: odds,
    p_stake: stake,
  });
  if (error) return { error: mapBetRpcError(error.message) };

  const result = data as {
    bet_id: string;
    new_balance: number;
    season_id: number;
  };

  revalidatePath("/dashboard");
  revalidatePath("/bets-board");

  return { success: true, ...result, possible_return };
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

  const { data: matches, error: matchesError } = await service
    .from("matches")
    .select("id, home_team, away_team, kickoff_time, status")
    .in("id", matchIds);

  if (matchesError || !matches || matches.length !== legsInput.length) {
    return { error: "部分賽事不存在" };
  }
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
  const { data, error } = await service.rpc("place_parlay", {
    p_user_id: user.id,
    p_match_ids: matchIds,
    p_selection: serializeParlay({ version: 1, legs }),
    p_total_odds: totalOdds,
    p_stake: stake,
  });
  if (error) return { error: mapBetRpcError(error.message) };

  const result = data as { bet_id: string; new_balance: number };

  revalidatePath("/dashboard");
  revalidatePath("/bets-board");
  revalidatePath("/leaderboard");

  return {
    success: true,
    ...result,
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
