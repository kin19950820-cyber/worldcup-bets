"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { classifyBetOutcome } from "@/lib/bet-stats";
import { parseParlay } from "@/lib/parlay";
import { getActiveSeason } from "@/lib/seasons";

export type WeeklyStanding = {
  name: string;
  profit: number;
  staked: number;
  bets: number;
};

export type WeeklyRecap = {
  gameweek: number;
  label: string; // 第 N 輪
  champion: { name: string; profit: number } | null;
  loser: { name: string; loss: number } | null;
  biggestUpset: { name: string; odds: number; detail: string } | null;
  totalStaked: number;
  betCount: number;
  standings: WeeklyStanding[];
};

type BetRow = {
  user_id: string;
  match_id: string | null;
  bet_type: string;
  selection: string;
  odds: number;
  stake: number;
  payout: number;
  status: string;
  profiles: { display_name: string } | null;
};

// Parses the round number out of "第 N 輪".
function parseGameweek(groupName: string | null): number | null {
  if (!groupName) return null;
  const m = groupName.match(/第\s*(\d+)\s*輪/);
  return m ? Number(m[1]) : null;
}

// Weekly (matchweek) recaps for the active season, latest gameweek first. A
// bet belongs to a gameweek by its match's round; a parlay is attributed to the
// latest round any of its legs fall in (the round it finally settles on).
export async function getWeeklyRecaps(): Promise<WeeklyRecap[]> {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const seasonId = getActiveSeason().id;

  const [matchesRes, betsRes] = await Promise.all([
    service
      .from("matches")
      .select("id, group_name")
      .eq("season_id", seasonId),
    service
      .from("bets")
      .select(
        "user_id, match_id, bet_type, selection, odds, stake, payout, status, profiles(display_name)"
      )
      .eq("season_id", seasonId),
  ]);

  const gwByMatch = new Map<string, number>();
  for (const m of (matchesRes.data as { id: string; group_name: string | null }[] | null) ??
    []) {
    const gw = parseGameweek(m.group_name);
    if (gw != null) gwByMatch.set(m.id, gw);
  }

  const gameweekOf = (bet: BetRow): number | null => {
    if (bet.match_id && gwByMatch.has(bet.match_id)) {
      return gwByMatch.get(bet.match_id)!;
    }
    const parlay = parseParlay(bet.selection);
    if (parlay) {
      const gws = parlay.legs
        .map((leg) => gwByMatch.get(leg.match_id))
        .filter((n): n is number => n != null);
      if (gws.length > 0) return Math.max(...gws);
    }
    return null;
  };

  // gameweek → user → aggregate
  const byWeek = new Map<
    number,
    Map<string, WeeklyStanding>
  >();
  const upsetByWeek = new Map<
    number,
    { name: string; odds: number; detail: string }
  >();

  for (const bet of (betsRes.data as unknown as BetRow[] | null) ?? []) {
    const outcome = classifyBetOutcome(bet);
    if (outcome === "pending") continue; // only settled bets count toward a week

    const gw = gameweekOf(bet);
    if (gw == null) continue;

    const name = bet.profiles?.display_name ?? "—";
    const net = Math.round((bet.payout - bet.stake) * 100) / 100;

    const week = byWeek.get(gw) ?? new Map<string, WeeklyStanding>();
    const row = week.get(bet.user_id) ?? {
      name,
      profit: 0,
      staked: 0,
      bets: 0,
    };
    row.profit = Math.round((row.profit + net) * 100) / 100;
    row.staked = Math.round((row.staked + bet.stake) * 100) / 100;
    row.bets += 1;
    week.set(bet.user_id, row);
    byWeek.set(gw, week);

    // Biggest upset = highest odds on a winning bet that week.
    if ((outcome === "won" || outcome === "half_won") && bet.odds > 0) {
      const current = upsetByWeek.get(gw);
      if (!current || bet.odds > current.odds) {
        const parlay = parseParlay(bet.selection);
        const detail = parlay
          ? `${parlay.legs.length} 關過關`
          : `${bet.bet_type}：${bet.selection}`;
        upsetByWeek.set(gw, { name, odds: bet.odds, detail });
      }
    }
  }

  const recaps: WeeklyRecap[] = [];
  for (const [gw, week] of byWeek) {
    const standings = [...week.values()].sort((a, b) => b.profit - a.profit);
    const top = standings[0] ?? null;
    const bottom = standings[standings.length - 1] ?? null;
    const totalStaked = standings.reduce((s, r) => s + r.staked, 0);
    const betCount = standings.reduce((s, r) => s + r.bets, 0);

    recaps.push({
      gameweek: gw,
      label: `第 ${gw} 輪`,
      champion: top ? { name: top.name, profit: top.profit } : null,
      loser:
        bottom && bottom.profit < 0
          ? { name: bottom.name, loss: bottom.profit }
          : null,
      biggestUpset: upsetByWeek.get(gw) ?? null,
      totalStaked: Math.round(totalStaked * 100) / 100,
      betCount,
      standings,
    });
  }

  recaps.sort((a, b) => b.gameweek - a.gameweek);
  return recaps;
}
