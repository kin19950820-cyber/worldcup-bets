// Evaluates live HKJC bet options against the model: parses supported market
// labels, computes model probability, expected value, market fair probability
// (margin removed) and Kelly staking for each option.

import type { BetOption } from "@/lib/types";
import type { MatchAnalysis } from "@/lib/quant/model";
import {
  asianHandicapEv,
  expectedValue,
  overUnderEv,
  removeMargin,
} from "@/lib/quant/math";

export type EvaluatedOption = {
  optionId: string;
  betType: string;
  selection: string;
  odds: number;
  modelProbability: number;
  marketProbability: number | null; // margin-removed; null when market incomplete
  ev: number;
  edge: number | null;
  kelly: number;
  isValue: boolean;
};

export const VALUE_EV_THRESHOLD = 0.03;

type Parsed =
  | { kind: "1x2"; outcome: "home" | "draw" | "away" }
  | { kind: "ou"; over: boolean; lines: number[] }
  | { kind: "ah"; side: "home" | "away"; lines: number[] }
  | { kind: "cs"; home: number; away: number };

function parseLines(text: string): number[] {
  return [...text.matchAll(/[+-]?\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value) && Math.abs(value) <= 15);
}

function parseOption(
  option: BetOption,
  homeTeam: string,
  awayTeam: string
): Parsed | null {
  const selection = option.selection;

  if (option.bet_type === "主客和") {
    if (selection.includes("和局")) return { kind: "1x2", outcome: "draw" };
    if (selection.includes(homeTeam)) return { kind: "1x2", outcome: "home" };
    if (selection.includes(awayTeam)) return { kind: "1x2", outcome: "away" };
    return null;
  }

  if (option.bet_type === "入球大細" && selection.startsWith("全場入球大細")) {
    const body = selection.replace(/^全場入球大細[：:]*/, "");
    const over = body.includes("大");
    const under = body.includes("細");
    if (over === under) return null; // missing or ambiguous side
    const lines = parseLines(body);
    if (lines.length === 0 || lines.length > 2) return null;
    return { kind: "ou", over, lines };
  }

  if (option.bet_type === "讓球" && selection.startsWith("全場讓球")) {
    const body = selection.replace(/^全場讓球[：:]*/, "");
    const side = body.includes(homeTeam)
      ? "home"
      : body.includes(awayTeam)
      ? "away"
      : null;
    if (!side) return null;
    const lines = parseLines(body.replace(homeTeam, "").replace(awayTeam, ""));
    if (lines.length === 0 || lines.length > 2) return null;
    return { kind: "ah", side, lines };
  }

  if (option.bet_type === "全場波膽") {
    const score = selection.match(/(\d+)\s*[:：]\s*(\d+)/);
    if (!score) return null;
    return { kind: "cs", home: Number(score[1]), away: Number(score[2]) };
  }

  return null;
}

export function evaluateOptions(
  options: BetOption[],
  homeTeam: string,
  awayTeam: string,
  analysis: MatchAnalysis
): EvaluatedOption[] {
  const marginDist = new Map(analysis.marginDist);
  const totalDist = new Map(analysis.totalDist);
  const awayMarginDist = new Map(
    analysis.marginDist.map(([margin, p]) => [-margin, p] as [number, number])
  );

  const parsed = options
    .map((option) => ({
      option,
      parsed: parseOption(option, homeTeam, awayTeam),
    }))
    .filter(
      (entry): entry is { option: BetOption; parsed: Parsed } =>
        entry.parsed !== null
    );

  // Market fair probabilities per complete group.
  const fairByOptionId = new Map<string, number>();

  const groups = new Map<string, Array<{ id: string; odds: number }>>();
  const groupKey = (entry: { parsed: Parsed }) => {
    const p = entry.parsed;
    if (p.kind === "1x2") return "1x2";
    if (p.kind === "ou") return `ou:${p.lines.join("/")}`;
    if (p.kind === "ah")
      return `ah:${p.lines.map((line) => Math.abs(line)).join("/")}`;
    return null;
  };
  const expectedGroupSize = (key: string) => (key === "1x2" ? 3 : 2);

  for (const entry of parsed) {
    const key = groupKey(entry);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push({ id: entry.option.id, odds: entry.option.odds });
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    if (list.length !== expectedGroupSize(key)) continue;
    const fair = removeMargin(list.map((item) => item.odds));
    list.forEach((item, index) => fairByOptionId.set(item.id, fair[index]));
  }

  return parsed
    .map(({ option, parsed: p }) => {
      let modelProbability: number;
      let ev: number;

      if (p.kind === "1x2") {
        modelProbability = analysis.probabilities[p.outcome];
        ev = expectedValue(modelProbability, option.odds);
      } else if (p.kind === "ou") {
        const result = overUnderEv(totalDist, p.lines, p.over, option.odds);
        modelProbability = result.winProbability;
        ev = result.ev;
      } else if (p.kind === "ah") {
        const dist = p.side === "home" ? marginDist : awayMarginDist;
        const result = asianHandicapEv(dist, p.lines, option.odds);
        modelProbability = result.winProbability;
        ev = result.ev;
      } else {
        modelProbability =
          p.home <= 10 && p.away <= 10 ? analysis.matrix[p.home][p.away] : 0;
        ev = expectedValue(modelProbability, option.odds);
      }

      const marketProbability = fairByOptionId.get(option.id) ?? null;
      return {
        optionId: option.id,
        betType: option.bet_type,
        selection: option.selection,
        odds: option.odds,
        modelProbability,
        marketProbability,
        ev,
        edge:
          marketProbability !== null
            ? modelProbability - marketProbability
            : null,
        kelly: ev > 0 && option.odds > 1 ? ev / (option.odds - 1) : 0,
        isValue: ev >= VALUE_EV_THRESHOLD,
      };
    })
    .sort((a, b) => b.ev - a.ev);
}
