"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { calculateLoanBalance } from "@/lib/loans";
import { getSeason, seasonWindow } from "@/lib/seasons";
import { parseParlay } from "@/lib/parlay";
import { formatCurrency } from "@/lib/utils";

export type HallAward = {
  key: string;
  icon: string;
  title: string;
  description: string;
  winners: Array<{ name: string; value: string; detail?: string }>;
};

const MIN_SETTLED_FOR_WIN_RATE = 10;

function topBy<T>(
  items: T[],
  metric: (item: T) => number,
  direction: "max" | "min" = "max"
): T[] {
  const valid = items.filter((item) => Number.isFinite(metric(item)));
  if (valid.length === 0) return [];
  const sign = direction === "max" ? 1 : -1;
  const best = Math.max(...valid.map((item) => sign * metric(item)));
  return valid.filter((item) => Math.abs(sign * metric(item) - best) < 1e-9);
}

export async function getHallOfFame(seasonId: number) {
  const supabase = await createClient();
  const service = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" as const };

  const season = getSeason(seasonId);
  if (!season) return { error: "找不到此季度" as const };
  const { startMs, endMs, endDate } = seasonWindow(season);

  const [profilesRes, betsRes, transactionsRes] = await Promise.all([
    supabase.from("profiles").select("id, display_name, starting_fund"),
    supabase
      .from("bets")
      .select("user_id, bet_type, selection, odds, stake, payout, status, created_at"),
    service
      .from("transactions")
      .select("user_id, bet_id, type, amount, balance_after, created_at")
      .order("created_at", { ascending: true }),
  ]);

  const profiles = profilesRes.data ?? [];
  const seasonBets = (betsRes.data ?? []).filter((bet) => {
    const time = new Date(bet.created_at).getTime();
    return time >= startMs && time < endMs;
  });
  const transactions = (transactionsRes.data ?? []).filter(
    (transaction) => new Date(transaction.created_at).getTime() < endMs
  );

  type PlayerStats = {
    name: string;
    betCount: number;
    totalStake: number;
    maxStake: number;
    settled: number;
    wins: number;
    bestMultiplier: number;
    bestMultiplierDetail: string;
    endNetWorth: number;
  };

  const players: PlayerStats[] = profiles
    .map((profile) => {
      const bets = seasonBets.filter((bet) => bet.user_id === profile.id);
      if (bets.length === 0) return null;

      let settled = 0;
      let wins = 0;
      let bestMultiplier = 0;
      let bestMultiplierDetail = "";
      for (const bet of bets) {
        if (["won", "half_won", "lost", "half_lost"].includes(bet.status)) {
          settled += 1;
          if (bet.status === "won" || bet.status === "half_won") wins += 1;
        }
        if (
          (bet.status === "won" || bet.status === "half_won") &&
          bet.payout > 0 &&
          bet.stake > 0
        ) {
          const multiplier = bet.payout / bet.stake;
          if (multiplier > bestMultiplier) {
            bestMultiplier = multiplier;
            const parlay = parseParlay(bet.selection);
            bestMultiplierDetail = parlay
              ? `${parlay.legs.length} 關過關 @ ${bet.odds}`
              : `${bet.bet_type} @ ${bet.odds}`;
          }
        }
      }

      const userTransactions = transactions.filter(
        (transaction) => transaction.user_id === profile.id
      );
      const lastTransaction = userTransactions[userTransactions.length - 1];
      const endBalance = lastTransaction
        ? lastTransaction.balance_after
        : profile.starting_fund;
      const loanOwed = calculateLoanBalance(
        userTransactions.filter(
          (transaction) =>
            transaction.bet_id === null &&
            ["loan", "adjustment", "loan_repayment"].includes(transaction.type)
        ),
        endDate
      ).totalOwed;

      return {
        name: profile.display_name,
        betCount: bets.length,
        totalStake: bets.reduce((sum, bet) => sum + bet.stake, 0),
        maxStake: Math.max(...bets.map((bet) => bet.stake)),
        settled,
        wins,
        bestMultiplier,
        bestMultiplierDetail,
        endNetWorth: Math.round((endBalance - loanOwed) * 100) / 100,
      };
    })
    .filter((player): player is PlayerStats => player !== null);

  const awards: HallAward[] = [
    {
      key: "top-stake",
      icon: "💰",
      title: "投注王",
      description: "本季投注總額最高",
      winners: topBy(players, (p) => p.totalStake).map((p) => ({
        name: p.name,
        value: formatCurrency(p.totalStake),
      })),
    },
    {
      key: "most-bets",
      icon: "🔥",
      title: "全勤獎",
      description: "本季投注次數最多（參與度最高）",
      winners: topBy(players, (p) => p.betCount).map((p) => ({
        name: p.name,
        value: `${p.betCount} 注`,
      })),
    },
    {
      key: "max-single",
      icon: "🎲",
      title: "豪賭王",
      description: "本季最高單注",
      winners: topBy(players, (p) => p.maxStake).map((p) => ({
        name: p.name,
        value: formatCurrency(p.maxStake),
      })),
    },
    {
      key: "best-multiplier",
      icon: "🎯",
      title: "神單獎",
      description: "最高倍數贏注（派彩 ÷ 本金）",
      winners: topBy(
        players.filter((p) => p.bestMultiplier > 0),
        (p) => p.bestMultiplier
      ).map((p) => ({
        name: p.name,
        value: `×${p.bestMultiplier.toFixed(2)}`,
        detail: p.bestMultiplierDetail,
      })),
    },
    {
      key: "richest",
      icon: "👑",
      title: "大富翁",
      description: "季末身家最多（扣除借款）",
      winners: topBy(players, (p) => p.endNetWorth).map((p) => ({
        name: p.name,
        value: formatCurrency(p.endNetWorth),
      })),
    },
    {
      key: "poorest",
      icon: "🪂",
      title: "天台常客",
      description: "季末身家最少（扣除借款）",
      winners: topBy(players, (p) => p.endNetWorth, "min").map((p) => ({
        name: p.name,
        value: formatCurrency(p.endNetWorth),
      })),
    },
    {
      key: "win-rate",
      icon: "📈",
      title: "勝率王",
      description: `本季勝率最高（至少 ${MIN_SETTLED_FOR_WIN_RATE} 注已結算）`,
      winners: topBy(
        players.filter((p) => p.settled >= MIN_SETTLED_FOR_WIN_RATE),
        (p) => p.wins / p.settled
      ).map((p) => ({
        name: p.name,
        value: `${((p.wins / p.settled) * 100).toFixed(0)}%`,
        detail: `${p.wins} 勝 / ${p.settled} 注`,
      })),
    },
  ].filter((award) => award.winners.length > 0);

  return {
    season: {
      id: season.id,
      name: season.name,
      ended: season.ended,
    },
    participantCount: players.length,
    totalBets: seasonBets.length,
    awards,
  };
}
