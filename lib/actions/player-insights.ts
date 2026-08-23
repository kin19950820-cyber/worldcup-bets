"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getActiveSeason } from "@/lib/seasons";
import { classifyBetOutcome } from "@/lib/bet-stats";
import { parseParlay } from "@/lib/parlay";
import { getLeaderboard } from "@/lib/actions/leaderboard";

export type RiskStyle = {
  label: string;
  emoji: string;
  blurb: string;
};

export type PlayerInsight = {
  id: string;
  name: string;
  netWorth: number;
  profitLoss: number;
  roi: number;
  winRate: number;
  totalBets: number;
  avgOdds: number;
  avgStake: number;
  parlayPct: number; // share of bets that are parlays
  favPct: number; // share with odds < 2.0
  dogPct: number; // share with odds >= 3.0
  rebuys: number;
  biggestWin: number;
  biggestWinDetail: string;
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: number;
  historicalLow: number;
  recovery: number; // netWorth − historicalLow
  riskStyle: RiskStyle;
};

type BetRow = {
  user_id: string;
  bet_type: string;
  selection: string;
  odds: number;
  stake: number;
  payout: number;
  status: string;
};

// A fun auto style from betting behaviour, checked in priority order.
function classifyRisk(p: {
  parlayPct: number;
  avgOdds: number;
  avgStake: number;
  dogPct: number;
  rebuys: number;
}): RiskStyle {
  if (p.parlayPct >= 0.4) {
    return { label: "過關狂魔", emoji: "🎰", blurb: "偏愛過關，博盡無悔" };
  }
  if (p.rebuys >= 3) {
    return { label: "All-in 型", emoji: "🔥", blurb: "輸曬再嚟，越挫越勇" };
  }
  if (p.avgStake >= 200) {
    return { label: "大注王", emoji: "💰", blurb: "落注豪爽，注注夠膽" };
  }
  if (p.dogPct >= 0.35 || p.avgOdds >= 2.6) {
    return { label: "冷門獵人", emoji: "🌚", blurb: "專攻高賠，博大冷門" };
  }
  if (p.avgOdds <= 1.7) {
    return { label: "穩陣派", emoji: "🐢", blurb: "只揀熱門，穩紮穩打" };
  }
  return { label: "保守派", emoji: "🧮", blurb: "注碼平均，風格均衡" };
}

export async function getPlayerInsights(): Promise<PlayerInsight[]> {
  const service = createServiceClient();
  const seasonId = getActiveSeason().id;

  const [{ entries }, betsRes] = await Promise.all([
    getLeaderboard(),
    service
      .from("bets")
      .select("user_id, bet_type, selection, odds, stake, payout, status")
      .eq("season_id", seasonId),
  ]);

  // Per-player betting-style aggregates.
  type Agg = {
    count: number;
    oddsSum: number;
    stakeSum: number;
    parlays: number;
    favs: number;
    dogs: number;
    biggestWin: number;
    biggestWinDetail: string;
  };
  const aggByUser = new Map<string, Agg>();
  for (const bet of (betsRes.data as BetRow[] | null) ?? []) {
    const a =
      aggByUser.get(bet.user_id) ?? {
        count: 0,
        oddsSum: 0,
        stakeSum: 0,
        parlays: 0,
        favs: 0,
        dogs: 0,
        biggestWin: 0,
        biggestWinDetail: "",
      };
    a.count += 1;
    a.oddsSum += bet.odds;
    a.stakeSum += bet.stake;
    const parlay = parseParlay(bet.selection);
    if (parlay) a.parlays += 1;
    if (bet.odds < 2) a.favs += 1;
    if (bet.odds >= 3) a.dogs += 1;
    const outcome = classifyBetOutcome(bet);
    if (outcome === "won" || outcome === "half_won") {
      const win = bet.payout - bet.stake;
      if (win > a.biggestWin) {
        a.biggestWin = Math.round(win * 100) / 100;
        a.biggestWinDetail = parlay
          ? `${parlay.legs.length} 關過關 @ ${bet.odds}`
          : `${bet.bet_type} @ ${bet.odds}`;
      }
    }
    aggByUser.set(bet.user_id, a);
  }

  return entries.map((e) => {
    const a = aggByUser.get(e.id);
    const count = a?.count ?? 0;
    const avgOdds = count > 0 ? a!.oddsSum / count : 0;
    const avgStake = count > 0 ? a!.stakeSum / count : 0;
    const parlayPct = count > 0 ? a!.parlays / count : 0;
    const favPct = count > 0 ? a!.favs / count : 0;
    const dogPct = count > 0 ? a!.dogs / count : 0;
    const rebuys = e.loan_count;

    return {
      id: e.id,
      name: e.display_name,
      netWorth: e.net_balance,
      profitLoss: e.profit_loss,
      roi: e.roi,
      winRate: e.win_rate,
      totalBets: count,
      avgOdds: Math.round(avgOdds * 100) / 100,
      avgStake: Math.round(avgStake * 100) / 100,
      parlayPct: Math.round(parlayPct * 100) / 100,
      favPct: Math.round(favPct * 100) / 100,
      dogPct: Math.round(dogPct * 100) / 100,
      rebuys,
      biggestWin: a?.biggestWin ?? 0,
      biggestWinDetail: a?.biggestWinDetail ?? "",
      longestWinStreak: e.longest_win_streak,
      longestLossStreak: e.longest_loss_streak,
      currentStreak: e.current_streak,
      historicalLow: e.historical_low,
      recovery: Math.round((e.net_balance - e.historical_low) * 100) / 100,
      riskStyle: classifyRisk({ parlayPct, avgOdds, avgStake, dogPct, rebuys }),
    };
  });
}
