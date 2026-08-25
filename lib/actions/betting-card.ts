"use server";

import { createClient } from "@/lib/supabase/server";
import { getPlayerInsights, type PlayerInsight } from "@/lib/actions/player-insights";
import { getWeeklyRecaps } from "@/lib/actions/weekly";

export type BettingCard = {
  name: string;
  netWorth: number;
  profitLoss: number;
  roi: number;
  style: { emoji: string; label: string };
  currentStreak: number;
  avgOdds: number;
  avgStake: number;
  biggestWin: number;
  rebuys: number;
  totalBets: number;
  winRate: number;
  gameweekTitles: number[]; // gameweeks this player won (王者)
  biggestUpsetOdds: number; // 最大冷門
};

// The signed-in player's shareable 戰績卡. Combines their leaderboard-derived
// insights with any matchweek championships.
export async function getMyBettingCard(): Promise<BettingCard | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [insights, recaps] = await Promise.all([
    getPlayerInsights(),
    getWeeklyRecaps(),
  ]);

  const me: PlayerInsight | undefined = insights.find((p) => p.id === user.id);
  if (!me) return null;

  const gameweekTitles = recaps
    .filter((r) => r.champion?.name === me.name)
    .map((r) => r.gameweek)
    .sort((a, b) => a - b);

  return {
    name: me.name,
    netWorth: me.netWorth,
    profitLoss: me.profitLoss,
    roi: me.roi,
    style: { emoji: me.riskStyle.emoji, label: me.riskStyle.label },
    currentStreak: me.currentStreak,
    avgOdds: me.avgOdds,
    avgStake: me.avgStake,
    biggestWin: me.biggestWin,
    rebuys: me.rebuys,
    totalBets: me.totalBets,
    winRate: me.winRate,
    gameweekTitles,
    biggestUpsetOdds: me.biggestWinOdds,
  };
}
