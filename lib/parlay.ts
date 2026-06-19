import type { BetStatus, BetType } from "@/lib/types";

export const PARLAY_PREFIX = "PARLAY_V1:";
export const PARLAY_BET_TYPE = "過關" as const;

export type ParlayLeg = {
  id: string;
  match_id: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  bet_type: Exclude<BetType, "過關">;
  selection: string;
  odds: number;
  status: BetStatus;
};

export type ParlayPayload = {
  version: 1;
  legs: ParlayLeg[];
};

export function serializeParlay(payload: ParlayPayload): string {
  return `${PARLAY_PREFIX}${JSON.stringify(payload)}`;
}

export function parseParlay(selection: string): ParlayPayload | null {
  if (!selection.startsWith(PARLAY_PREFIX)) return null;

  try {
    const payload = JSON.parse(selection.slice(PARLAY_PREFIX.length));
    if (payload?.version !== 1 || !Array.isArray(payload.legs)) return null;
    return payload as ParlayPayload;
  } catch {
    return null;
  }
}

export function getLegMultiplier(leg: Pick<ParlayLeg, "odds" | "status">) {
  switch (leg.status) {
    case "won":
      return leg.odds;
    case "half_won":
      return (leg.odds + 1) / 2;
    case "half_lost":
      return 0.5;
    case "void":
      return 1;
    case "lost":
      return 0;
    default:
      return null;
  }
}

export function getParlayPossibleReturn(stake: number, legs: ParlayLeg[]) {
  const totalOdds = legs.reduce((product, leg) => product * leg.odds, 1);
  return Math.round(stake * totalOdds * 100) / 100;
}

export function getParlaySettlement(stake: number, legs: ParlayLeg[]) {
  const multipliers = legs.map(getLegMultiplier);
  const hasLost = multipliers.includes(0);
  const hasPending = multipliers.includes(null);

  if (!hasLost && hasPending) {
    return { complete: false, payout: 0, status: "pending" as const };
  }

  const payout = Math.round(
    stake *
      multipliers.reduce<number>(
        (product, multiplier) => product * (multiplier ?? 1),
        1
      ) *
      100
  ) / 100;

  if (hasLost || payout === 0) {
    return { complete: true, payout: 0, status: "lost" as const };
  }

  const allVoid = legs.every((leg) => leg.status === "void");
  return {
    complete: true,
    payout,
    status: allVoid ? ("void" as const) : ("won" as const),
  };
}
