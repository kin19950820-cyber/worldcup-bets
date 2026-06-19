"use server";

import type { BetOption, Match } from "@/lib/types";

type PolymarketMarket = {
  id: string;
  question: string;
  outcomes: string;
  outcomePrices: string;
  sportsMarketType?: string;
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

function optionFromMarket(
  market: PolymarketMarket,
  match: Match
): BetOption | null {
  if (!market.active || market.closed) return null;

  const outcomes = parseJsonArray(market.outcomes);
  const prices = parseJsonArray(market.outcomePrices);
  const yesIndex = outcomes.findIndex(
    (outcome) => outcome.toLowerCase() === "yes"
  );
  const yesPrice = yesIndex >= 0 ? prices[yesIndex] : null;
  if (!yesPrice) return null;

  const odds = decimalOddsFromProbability(yesPrice);
  if (!odds || odds <= 1) return null;

  const question = market.question;
  const normalizedQuestion = normalizeName(question);
  const homeNames = teamNames(match.home_team);
  const awayNames = teamNames(match.away_team);

  let selection: string | null = null;
  if (normalizedQuestion.includes("draw")) {
    selection = "和局";
  } else if (homeNames.some((name) => normalizedQuestion.includes(name))) {
    selection = match.home_team;
  } else if (awayNames.some((name) => normalizedQuestion.includes(name))) {
    selection = match.away_team;
  }

  if (!selection) return null;

  return {
    id: `polymarket-${market.id}`,
    source: "Polymarket",
    market: question,
    bet_type: "主客和",
    selection,
    odds,
    updated_at: market.updatedAt ?? null,
  };
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
        .map((market) => optionFromMarket(market, match))
        .filter((option): option is BetOption => option !== null)
        .sort((a, b) => a.selection.localeCompare(b.selection));

      if (options.length > 0) {
        optionsByMatchId[match.id] = options;
      }
    }

    return optionsByMatchId;
  } catch {
    return {};
  }
}
