"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { BetType } from "@/lib/types";

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

  // Verify match hasn't started
  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("kickoff_time, status, home_team, away_team")
    .eq("id", match_id)
    .single();

  if (matchErr || !match) return { error: "找不到此賽事" };
  if (new Date(match.kickoff_time) <= new Date())
    return { error: "賽事已開始，不能投注" };
  if (!["SCHEDULED", "TIMED"].includes(match.status))
    return { error: "此賽事狀態不允許投注" };

  // Check balance
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_balance")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "找不到用戶資料" };
  if (profile.current_balance < stake)
    return { error: `餘額不足，現時餘額：HK$${profile.current_balance.toFixed(2)}` };

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
