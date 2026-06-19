"use server";

import type { BetOption, Match } from "@/lib/types";

type PolymarketMarket = {
  id: string;
  question: string;
  description?: string;
  outcomes: string | string[];
  outcomePrices: string | string[] | number[];
  sportsMarketType?: string;
  groupItemTitle?: string;
  line?: number;
  endDate?: string;
  bestAsk?: number;
  active?: boolean;
  closed?: boolean;
  updatedAt?: string;
  events?: Array<{
    title?: string;
    description?: string;
    parentEventId?: number | string;
  }>;
};

type PolymarketEvent = {
  id: string;
  title: string;
  gameId?: number;
  markets?: PolymarketMarket[];
};

const POLYMARKET_WORLD_CUP_SERIES_ID = "11433";
const SUPPLEMENTAL_MARKET_TYPES = [
  "soccer_exact_score",
  "correct_score",
  "moneyline",
  "spreads",
  "match_handicap",
  "double_chance",
  "total_goals",
  "totals",
  "team_totals",
  "game_team_totals",
  "soccer_home_team_totals",
  "soccer_away_team_totals",
  "soccer_team_totals",
  "both_teams_to_score",
  "soccer_first_to_score",
  "soccer_anytime_goalscorer",
  "soccer_halftime_result",
  "soccer_second_half_result",
  "first_half_moneyline",
  "first_half_spreads",
  "first_half_totals",
  "second_half_totals",
  "soccer_first_half_team_totals",
  "soccer_second_half_team_totals",
  "both_teams_to_score_first_half",
  "both_teams_to_score_second_half",
  "total_corners",
  "soccer_first_corner",
  "soccer_first_half_total_corners",
  "soccer_second_half_total_corners",
  "soccer_team_total_corners",
  "soccer_game_corners_odd_even",
  "soccer_player_assists",
  "soccer_player_goals",
  "soccer_player_goals_plus_assists",
  "soccer_player_shots",
  "soccer_player_shots_on_target",
];

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

const SPREAD_MARKET_TYPES = new Set([
  "spread",
  "handicap",
  "spreads",
  "match_handicap",
  "first_half_spreads",
]);

const LINE_MARKET_TYPES = new Set([
  "total",
  "totals",
  "total_goals",
  "team_total",
  "team_totals",
  "game_team_totals",
  "soccer_home_team_totals",
  "soccer_away_team_totals",
  "soccer_team_totals",
  "first_half_totals",
  "second_half_totals",
  "soccer_first_half_team_totals",
  "soccer_second_half_team_totals",
  "total_corners",
  "soccer_first_half_total_corners",
  "soccer_second_half_total_corners",
  "soccer_team_total_corners",
  "soccer_player_assists",
  "soccer_player_goals",
  "soccer_player_goals_plus_assists",
  "soccer_player_shots",
  "soccer_player_shots_on_target",
]);

function parseJsonArray(value: string | string[] | number[]): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

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

function marketMatchesMatch(market: PolymarketMarket, match: Match) {
  const searchableText = [
    market.question,
    market.description,
    market.groupItemTitle,
    ...(market.events ?? []).flatMap((event) => [
      event.title,
      event.description,
    ]),
  ]
    .filter(Boolean)
    .join(" ");

  return titleMatchesEvent(searchableText, match);
}

function decimalOddsFromProbability(price: string) {
  const probability = Number(price);
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    return null;
  }

  return Math.round((1 / probability) * 100) / 100;
}

function decimalOddsFromNumber(price: number | null | undefined) {
  if (!Number.isFinite(price) || !price || price <= 0 || price >= 1) {
    return null;
  }

  return Math.round((1 / price) * 100) / 100;
}

function decimalOddsForOutcome(
  market: PolymarketMarket,
  outcome: string,
  price: string
) {
  const priceOdds = decimalOddsFromProbability(price);
  if (outcome.toLowerCase() !== "yes") return priceOdds;

  const askOdds = decimalOddsFromNumber(market.bestAsk);
  return askOdds && askOdds > 1.01 ? askOdds : priceOdds;
}

function formatLine(line: number) {
  return line > 0 ? `+${line}` : String(line);
}

function parseLineFromText(value: string | undefined) {
  if (!value) return null;

  const parenMatch = value.match(/\(([-+]?\d+(?:\.\d+)?)\)/);
  if (parenMatch) return Number(parenMatch[1]);

  const numberMatch = value.match(/([-+]?\d+(?:\.\d+)?)/);
  return numberMatch ? Number(numberMatch[1]) : null;
}

function parseSpreadTitle(market: PolymarketMarket) {
  const title = market.groupItemTitle || market.question;
  const match = title.match(/^(?:Spread:\s*)?(.+?)\s*\(([-+]?\d+(?:\.\d+)?)\)/i);
  if (!match) return null;

  return {
    team: match[1].trim(),
    line: Number(match[2]),
  };
}

function betTypeFromMarket(market: PolymarketMarket): BetOption["bet_type"] {
  switch (market.sportsMarketType) {
    case "moneyline":
    case "double_chance":
      return "主客和";
    case "spread":
    case "handicap":
    case "spreads":
    case "match_handicap":
      return "讓球";
    case "first_half_moneyline":
    case "q1_moneyline":
    case "q2_moneyline":
    case "q3_moneyline":
    case "q4_moneyline":
    case "soccer_halftime_result":
    case "soccer_second_half_result":
      return "半全場";
    case "first_half_spreads":
      return "讓球";
    case "first_half_totals":
    case "second_half_totals":
    case "soccer_first_half_team_totals":
    case "soccer_second_half_team_totals":
    case "both_teams_to_score_first_half":
    case "both_teams_to_score_second_half":
      return "入球大細";
    case "total":
    case "totals":
    case "total_goals":
    case "team_total":
    case "team_totals":
    case "game_team_totals":
    case "soccer_home_team_totals":
    case "soccer_away_team_totals":
    case "soccer_team_totals":
    case "both_teams_to_score":
      return "入球大細";
    case "soccer_first_to_score":
    case "soccer_anytime_goalscorer":
      return "首名入球";
    case "soccer_player_goals":
    case "soccer_player_goals_plus_assists":
      return "球員表現";
    case "correct_score":
    case "soccer_exact_score":
      return "波膽";
    case "total_corners":
    case "soccer_first_corner":
    case "soccer_first_half_total_corners":
    case "soccer_second_half_total_corners":
    case "soccer_team_total_corners":
    case "soccer_game_corners_odd_even":
      return "其他";
    case "soccer_player_assists":
    case "player_prop":
    case "soccer_player_goalkeeper_saves":
    case "soccer_player_shots":
    case "soccer_player_shots_on_target":
      return "球員表現";
    case "to_qualify":
    case "soccer_team_to_advance":
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

  if (
    market.sportsMarketType === "soccer_exact_score" ||
    market.sportsMarketType === "correct_score"
  ) {
    return (market.groupItemTitle || question)
      .replace(/^Exact Score:\s*/i, "")
      .replace(/\?$/, "");
  }

  if (normalizedQuestion.includes("draw")) return "和局";
  if (homeNames.some((name) => normalizedQuestion.includes(name))) {
    return match.home_team;
  }
  if (awayNames.some((name) => normalizedQuestion.includes(name))) {
    return match.away_team;
  }

  return market.groupItemTitle || question.replace(/^Will\s+/i, "");
}

function shouldUseOnlyYesOutcome(market: PolymarketMarket) {
  return [
    "moneyline",
    "first_half_moneyline",
    "q1_moneyline",
    "q2_moneyline",
    "q3_moneyline",
    "q4_moneyline",
    "double_chance",
    "soccer_halftime_result",
    "soccer_second_half_result",
    "correct_score",
    "soccer_exact_score",
    "soccer_first_to_score",
    "soccer_anytime_goalscorer",
    "to_qualify",
    "soccer_team_to_advance",
  ].includes(market.sportsMarketType ?? "");
}

function selectionWithOutcome(
  market: PolymarketMarket,
  match: Match,
  outcome: string
) {
  const baseSelection = selectionFromQuestion(market, match, outcome);
  const normalizedOutcome = outcome.toLowerCase();
  const marketType = market.sportsMarketType ?? "";

  if (SPREAD_MARKET_TYPES.has(marketType)) {
    const spread = parseSpreadTitle(market);
    if (!spread) return baseSelection;

    const selectedLine =
      normalizeName(outcome) === normalizeName(spread.team)
        ? spread.line
        : -spread.line;
    return `${outcome} ${formatLine(selectedLine)}`;
  }

  if (
    LINE_MARKET_TYPES.has(marketType) &&
    normalizedOutcome !== "yes" &&
    normalizedOutcome !== "no"
  ) {
    const line = market.line ?? parseLineFromText(market.groupItemTitle);
    return line == null ? outcome : `${outcome} ${formatLine(line)}`;
  }

  if (normalizedOutcome === "yes") return baseSelection;
  if (normalizedOutcome === "no") return `不是：${baseSelection}`;

  return outcome;
}

function optionFromMarket(
  market: PolymarketMarket,
  match: Match
): BetOption[] {
  if (market.active === false || market.closed) return [];

  const outcomes = parseJsonArray(market.outcomes);
  const prices = parseJsonArray(market.outcomePrices);
  const bet_type = betTypeFromMarket(market);
  const pricedOutcomes = outcomes.map((outcome, index) => ({
    outcome,
    price: prices[index],
    index,
  }));
  const usableOutcomes = shouldUseOnlyYesOutcome(market)
    ? pricedOutcomes.filter(
        ({ outcome }) => outcome.toLowerCase() === "yes"
      )
    : pricedOutcomes;

  return usableOutcomes
    .map(({ outcome, price, index }) => {
      const odds = decimalOddsForOutcome(market, outcome, price);
      if (!odds || odds <= 1) return null;

      return {
        id: `polymarket-${market.id}-${index}`,
        market: market.question,
        bet_type,
        selection: selectionWithOutcome(market, match, outcome),
        odds,
        updated_at: market.updatedAt ?? null,
      };
    })
    .filter((option): option is BetOption => option !== null);
}

function utcDayRange(date: string) {
  const value = new Date(date);
  const start = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCMilliseconds(-1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function fetchSupplementalMarkets(matches: Match[]) {
  const ranges = Array.from(
    new Map(
      matches.map((match) => {
        const range = utcDayRange(match.kickoff_time);
        return [`${range.start}-${range.end}`, range];
      })
    ).values()
  );

  const responses = await Promise.all(
    ranges.flatMap((range) =>
      SUPPLEMENTAL_MARKET_TYPES.map(async (marketType) => {
        try {
          const url = new URL("https://gamma-api.polymarket.com/markets/keyset");
          url.searchParams.set("closed", "false");
          url.searchParams.set("limit", "100");
          url.searchParams.set("sports_market_types", marketType);
          url.searchParams.set("end_date_min", range.start);
          url.searchParams.set("end_date_max", range.end);

          const response = await fetch(url, { next: { revalidate: 60 } });
          if (!response.ok) return [];

          const data = (await response.json()) as {
            markets?: PolymarketMarket[];
          };
          return data.markets ?? [];
        } catch {
          return [];
        }
      })
    )
  );

  return responses.flat();
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
    const supplementalMarkets = await fetchSupplementalMarkets(matches);
    const optionsByMatchId: Record<string, BetOption[]> = {};

    for (const match of matches) {
      const event = events.find((candidate) =>
        titleMatchesEvent(candidate.title, match)
      );
      const eventMarkets = event?.markets ?? [];
      const extraMarkets = supplementalMarkets.filter((market) =>
        marketMatchesMatch(market, match)
      );

      const seenMarketIds = new Set<string>();
      const markets = [...eventMarkets, ...extraMarkets].filter((market) => {
        if (seenMarketIds.has(market.id)) return false;
        seenMarketIds.add(market.id);
        return true;
      });

      if (markets.length === 0) continue;

      const options = markets
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
