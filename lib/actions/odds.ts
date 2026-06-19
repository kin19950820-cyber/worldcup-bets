"use server";

import type { BetOption, Match } from "@/lib/types";

type PolymarketMarket = {
  id: string;
  question: string;
  outcomes: string;
  outcomePrices: string;
  sportsMarketType?: string;
  groupItemTitle?: string;
  line?: number;
  active?: boolean;
  closed?: boolean;
  updatedAt?: string;
};

type PolymarketEvent = {
  id: string;
  title: string;
  markets?: PolymarketMarket[];
};

const POLYMARKET_WORLD_CUP_SERIES_ID = "11433";

const TEAM_ALIASES: Record<string, string[]> = {
  USA: ["United States", "USMNT"],
  "United States": ["USA", "USMNT"],
  "Korea Republic": ["South Korea"],
  "South Korea": ["Korea Republic"],
  "IR Iran": ["Iran"],
  Iran: ["IR Iran"],
  Türkiye: ["Turkey"],
  Turkey: ["Türkiye"],
};

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function teamNames(name: string) {
  return [name, ...(TEAM_ALIASES[name] ?? [])].map(normalizeName);
}

function titleMatchesEvent(title: string, match: Match) {
  const normalizedTitle = normalizeName(title);
  const homeNames = teamNames(match.home_team);
  const awayNames = teamNames(match.away_team);

  return (
    homeNames.some((name) => normalizedTitle.includes(name)) &&
    awayNames.some((name) => normalizedTitle.includes(name))
  );
}

function decimalOddsFromProbability(price: string) {
  const probability = Number(price);
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    return null;
  }

  return Math.round((1 / probability) * 100) / 100;
}

function betTypeFromMarket(market: PolymarketMarket): BetOption["bet_type"] {
  switch (market.sportsMarketType) {
    case "moneyline":
      return "主客和";
    case "spread":
    case "handicap":
      return "讓球";
    case "total":
    case "team_total":
      return "入球大細";
    case "player_prop":
      return "球員表現";
    case "to_qualify":
      return "晉級";
    case "outright":
      return "冠軍";
    default:
      return "特別盤";
  }
}

function selectionFromQuestion(
  market: PolymarketMarket,
  match: Match,
  outcome: string
) {
  const question = market.question;
  const normalizedQuestion = normalizeName(question);
  const homeNames = teamNames(match.home_team);
  const awayNames = teamNames(match.away_team);

  if (outcome.toLowerCase() !== "yes") {
    return `${outcome}：${question}`;
  }

  if (normalizedQuestion.includes("draw")) return "和局";
  if (homeNames.some((name) => normalizedQuestion.includes(name))) {
    return match.home_team;
  }
  if (awayNames.some((name) => normalizedQuestion.includes(name))) {
    return match.away_team;
  }

  return market.groupItemTitle || question;
}

function optionFromMarket(
  market: PolymarketMarket,
  match: Match
): BetOption[] {
  if (!market.active || market.closed) return [];

  const outcomes = parseJsonArray(market.outcomes);
  const prices = parseJsonArray(market.outcomePrices);
  const bet_type = betTypeFromMarket(market);

  return outcomes
    .map((outcome, index) => {
      const odds = decimalOddsFromProbability(prices[index]);
      if (!odds || odds <= 1) return null;

      return {
        id: `polymarket-${market.id}-${index}`,
        market: market.question,
        bet_type,
        selection: selectionFromQuestion(market, match, outcome),
        odds,
        updated_at: market.updatedAt ?? null,
      };
    })
    .filter((option): option is BetOption => option !== null);
}

export async function getBetOptionsForMatches(matches: Match[]) {
  if (matches.length === 0) return {};

  try {
    const url = new URL("https://gamma-api.polymarket.com/events");
    url.searchParams.set("series_id", POLYMARKET_WORLD_CUP_SERIES_ID);
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("limit", "500");

    const response = await fetch(url, { next: { revalidate: 60 } });
    if (!response.ok) return {};

    const events = (await response.json()) as PolymarketEvent[];
    const optionsByMatchId: Record<string, BetOption[]> = {};

    for (const match of matches) {
      const event = events.find((candidate) =>
        titleMatchesEvent(candidate.title, match)
      );
      if (!event?.markets?.length) continue;

      const options = event.markets
        .flatMap((market) => optionFromMarket(market, match))
        .sort((a, b) =>
          a.bet_type === b.bet_type
            ? a.selection.localeCompare(b.selection)
            : a.bet_type.localeCompare(b.bet_type)
        );

      if (options.length > 0) {
        optionsByMatchId[match.id] = options;
      }
    }

    return optionsByMatchId;
  } catch {
    return {};
  }
}
