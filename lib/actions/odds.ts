"use server";

import type { BetOption, Match } from "@/lib/types";
import { isMatchBettable } from "@/lib/match-status";
import { createClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

type HkjcOddsType =
  | "HAD"
  | "SGA"
  | "CHP"
  | "TQL"
  | "FHA"
  | "HHA"
  | "HDC"
  | "HIL"
  | "FHL"
  | "CHL"
  | "FCH"
  | "CRS"
  | "FCS"
  | "FTS"
  | "TTG"
  | "OOE"
  | "FGS"
  | "HFT"
  | "MSP"
  | "NTS"
  | "FHH"
  | "FHC"
  | "CHD"
  | "AGS"
  | "LGS";

type HkjcSelection = {
  selId?: string;
  str?: string;
  name_ch?: string;
  name_en?: string;
};

type HkjcCombination = {
  combId?: string;
  str?: string;
  status?: string;
  currentOdds?: string;
  selections?: HkjcSelection[];
};

type HkjcLine = {
  lineId?: string;
  status?: string;
  condition?: string;
  main?: boolean;
  combinations?: HkjcCombination[];
};

type HkjcPool = {
  id: string;
  status?: string;
  oddsType: HkjcOddsType;
  name_ch?: string;
  name_en?: string;
  updateAt?: string;
  expectedSuspendDateTime?: string;
  lines?: HkjcLine[];
};

type HkjcMatch = {
  id: string;
  frontEndId?: string;
  matchDate?: string;
  kickOffTime?: string;
  status?: string;
  updateAt?: string;
  homeTeam?: {
    name_en?: string;
    name_ch?: string;
  };
  awayTeam?: {
    name_en?: string;
    name_ch?: string;
  };
  tournament?: {
    code?: string;
    name_en?: string;
    name_ch?: string;
  };
  foPools?: HkjcPool[];
};

type HkjcGraphqlResponse = {
  data?: {
    matches?: HkjcMatch[] | null;
  };
  errors?: Array<{ message?: string }>;
};

const HKJC_GRAPHQL_ENDPOINT =
  process.env.HKJC_GRAPHQL_ENDPOINT ?? "https://info.cld.hkjc.com/graphql/base/";
const HKJC_FOOTBALL_ORIGIN = "https://bet.hkjc.com";
const HKJC_FOOTBALL_REFERER = "https://bet.hkjc.com/";
const HKJC_ODDS_BATCH_SIZE = 4;

const HKJC_ODDS_TYPES: HkjcOddsType[] = [
  "HAD",
  "HDC",
  "HHA",
  "HIL",
  "CRS",
  "FCS",
  "FHA",
  "HFT",
  "FHL",
  "TTG",
  "FTS",
  "FGS",
  "AGS",
  "LGS",
  "NTS",
  "CHL",
  "FCH",
  "FHC",
  "CHD",
  "OOE",
  "MSP",
  "TQL",
  "CHP",
  "SGA",
  "FHH",
];

const ODDS_TYPES_BY_BET_TYPE: Partial<Record<BetOption["bet_type"], HkjcOddsType[]>> = {
  主客和: ["HAD"],
  讓球: ["HDC", "FHH"],
  讓球主客和: ["HHA"],
  入球大細: ["HIL", "FHL"],
  入球數: ["TTG"],
  波膽: ["CRS", "FCS"],
  全場波膽: ["CRS"],
  半場波膽: ["FCS"],
  半全場: ["HFT"],
  半場主客和: ["FHA"],
  首名入球: ["FTS"],
  角球: ["CHL", "FCH", "FHC", "CHD"],
  全場角球: ["CHL", "FCH", "CHD"],
  半場角球: ["FHC"],
  球員表現: ["FGS", "AGS", "LGS", "NTS"],
  晉級: ["TQL"],
  冠軍: ["CHP"],
  特別盤: ["OOE", "MSP", "SGA"],
};

const HKJC_MATCH_QUERY = `
query matchList($startIndex: Int, $endIndex: Int, $startDate: String, $endDate: String, $matchIds: [String], $tournIds: [String], $fbOddsTypes: [FBOddsType]!, $fbOddsTypesM: [FBOddsType]!, $inplayOnly: Boolean, $featuredMatchesOnly: Boolean, $frontEndIds: [String], $earlySettlementOnly: Boolean, $showAllMatch: Boolean) {
  matches(startIndex: $startIndex, endIndex: $endIndex, startDate: $startDate, endDate: $endDate, matchIds: $matchIds, tournIds: $tournIds, fbOddsTypes: $fbOddsTypesM, inplayOnly: $inplayOnly, featuredMatchesOnly: $featuredMatchesOnly, frontEndIds: $frontEndIds, earlySettlementOnly: $earlySettlementOnly, showAllMatch: $showAllMatch) {
    id
    frontEndId
    matchDate
    kickOffTime
    status
    updateAt
    sequence
    esIndicatorEnabled
    homeTeam {
      id
      name_en
      name_ch
    }
    awayTeam {
      id
      name_en
      name_ch
    }
    tournament {
      id
      frontEndId
      nameProfileId
      isInteractiveServiceAvailable
      code
      name_en
      name_ch
    }
    isInteractiveServiceAvailable
    inplayDelay
    venue {
      code
      name_en
      name_ch
    }
    tvChannels {
      code
      name_en
      name_ch
    }
    liveEvents {
      id
      code
    }
    featureStartTime
    featureMatchSequence
    poolInfo {
      normalPools
      inplayPools
      sellingPools
      ntsInfo
      entInfo
      definedPools
      ngsInfo {
        str
        name_en
        name_ch
        instNo
      }
      agsInfo {
        str
        name_en
        name_ch
      }
    }
    runningResult {
      homeScore
      awayScore
      corner
      homeCorner
      awayCorner
    }
    runningResultExtra {
      homeScore
      awayScore
      corner
      homeCorner
      awayCorner
    }
    adminOperation {
      remark {
        typ
      }
    }
    foPools(fbOddsTypes: $fbOddsTypes) {
      id
      status
      oddsType
      instNo
      inplay
      name_ch
      name_en
      updateAt
      expectedSuspendDateTime
      lines {
        lineId
        status
        condition
        main
        combinations {
          combId
          str
          status
          offerEarlySettlement
          currentOdds
          selections {
            selId
            str
            name_ch
            name_en
          }
        }
      }
    }
  }
}`;

const BET_TYPE_BY_HKJC_ODDS_TYPE: Record<
  HkjcOddsType,
  BetOption["bet_type"]
> = {
  HAD: "主客和",
  HDC: "讓球",
  HHA: "讓球主客和",
  HIL: "入球大細",
  CRS: "全場波膽",
  FCS: "半場波膽",
  FHA: "半場主客和",
  HFT: "半全場",
  FHL: "入球大細",
  TTG: "入球數",
  FTS: "首名入球",
  FGS: "球員表現",
  AGS: "球員表現",
  LGS: "球員表現",
  NTS: "球員表現",
  CHL: "全場角球",
  FCH: "全場角球",
  FHC: "半場角球",
  CHD: "全場角球",
  OOE: "特別盤",
  MSP: "特別盤",
  TQL: "晉級",
  CHP: "冠軍",
  SGA: "特別盤",
  FHH: "讓球",
};

const TEAM_ALIASES: Record<string, string[]> = {
  USA: ["United States", "USMNT", "美國"],
  "United States": ["USA", "USMNT", "美國"],
  Germany: ["Deutschland", "德國"],
  "Ivory Coast": [
    "Cote d'Ivoire",
    "Côte d'Ivoire",
    "Côte d’Ivoire",
    "Republic of Côte d'Ivoire",
    "科特迪瓦",
  ],
  "Cote d'Ivoire": ["Ivory Coast", "Côte d'Ivoire", "科特迪瓦"],
  "Côte d'Ivoire": ["Ivory Coast", "Cote d'Ivoire", "科特迪瓦"],
  "Korea Republic": ["South Korea", "南韓", "韓國"],
  "South Korea": ["Korea Republic", "南韓", "韓國"],
  "DR Congo": [
    "Congo DR",
    "D R Congo",
    "Democratic Republic of Congo",
    "Democratic Republic of the Congo",
    "剛果民主共和國",
    "民主剛果",
  ],
  "Congo DR": [
    "DR Congo",
    "D R Congo",
    "Democratic Republic of Congo",
    "Democratic Republic of the Congo",
    "剛果民主共和國",
    "民主剛果",
  ],
  "Democratic Republic of Congo": [
    "DR Congo",
    "Congo DR",
    "D R Congo",
    "剛果民主共和國",
    "民主剛果",
  ],
  "Democratic Republic of the Congo": [
    "DR Congo",
    "Congo DR",
    "D R Congo",
    "剛果民主共和國",
    "民主剛果",
  ],
  "IR Iran": ["Iran", "伊朗"],
  Iran: ["IR Iran", "伊朗"],
  Türkiye: ["Turkey", "土耳其"],
  Turkey: ["Türkiye", "土耳其"],
};

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

function teamNames(name: string) {
  return [name, ...(TEAM_ALIASES[name] ?? [])]
    .map(normalizeName)
    .filter(Boolean);
}

function hkjcTeamNames(team: HkjcMatch["homeTeam"]) {
  return [team?.name_en, team?.name_ch].filter(Boolean).map(String);
}

function hkjcMatchKickoffTime(hkjcMatch: HkjcMatch) {
  const matchDate = hkjcMatch.matchDate?.trim();
  const kickOffTime = hkjcMatch.kickOffTime?.trim();
  if (!matchDate || !kickOffTime) return null;

  const candidates = [
    `${matchDate}T${kickOffTime}`,
    `${matchDate} ${kickOffTime}`,
    `${matchDate}T${kickOffTime}+08:00`,
    `${matchDate} ${kickOffTime}+08:00`,
  ];

  for (const candidate of candidates) {
    const time = new Date(candidate).getTime();
    if (Number.isFinite(time)) return time;
  }

  return null;
}

function kickoffTimesAreClose(hkjcMatch: HkjcMatch, match: Match) {
  const hkjcKickoff = hkjcMatchKickoffTime(hkjcMatch);
  const localKickoff = new Date(match.kickoff_time).getTime();

  if (!hkjcKickoff || !Number.isFinite(localKickoff)) return false;

  const threeHours = 3 * 60 * 60 * 1000;
  return Math.abs(hkjcKickoff - localKickoff) <= threeHours;
}

function hkjcTeamMatchDetails(hkjcMatch: HkjcMatch, match: Match) {
  const homeNames = hkjcTeamNames(hkjcMatch.homeTeam).map(normalizeName);
  const awayNames = hkjcTeamNames(hkjcMatch.awayTeam).map(normalizeName);
  const localHomeNames = teamNames(match.home_team);
  const localAwayNames = teamNames(match.away_team);

  const homeMatches = localHomeNames.some((localName) =>
    homeNames.some(
      (hkjcName) =>
        hkjcName.includes(localName) || localName.includes(hkjcName)
    )
  );
  const awayMatches = localAwayNames.some((localName) =>
    awayNames.some(
      (hkjcName) =>
        hkjcName.includes(localName) || localName.includes(hkjcName)
    )
  );

  return { homeMatches, awayMatches };
}

function hkjcMatchMatchesLocalMatch(hkjcMatch: HkjcMatch, match: Match) {
  const { homeMatches, awayMatches } = hkjcTeamMatchDetails(hkjcMatch, match);

  return homeMatches && awayMatches;
}

function hkjcMatchFallbackMatchesLocalMatch(
  hkjcMatch: HkjcMatch,
  match: Match
) {
  const { homeMatches, awayMatches } = hkjcTeamMatchDetails(hkjcMatch, match);

  return (homeMatches || awayMatches) && kickoffTimesAreClose(hkjcMatch, match);
}

function matchingHkjcMatchesForLocalMatch(
  hkjcMatches: HkjcMatch[],
  match: Match
) {
  const strictMatches = hkjcMatches.filter((hkjcMatch) =>
    hkjcMatchMatchesLocalMatch(hkjcMatch, match)
  );

  if (strictMatches.length > 0) return strictMatches;

  return hkjcMatches.filter((hkjcMatch) =>
    hkjcMatchFallbackMatchesLocalMatch(hkjcMatch, match)
  );
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function isOpenStatus(status: string | undefined) {
  return (
    !status ||
    ["AVAILABLE", "SELLING", "SELLINGSTARTED", "OPEN"].includes(status)
  );
}

function parseOdds(value: string | undefined) {
  if (!value || value === "---") return null;

  const odds = Number(value);
  if (!Number.isFinite(odds) || odds <= 1) return null;

  return odds;
}

function selectionName(selection: HkjcSelection | undefined) {
  return selection?.name_ch || selection?.name_en || selection?.str || "";
}

function invertSignedNumber(value: string) {
  if (value.startsWith("+")) return `-${value.slice(1)}`;
  if (value.startsWith("-")) return `+${value.slice(1)}`;
  return `-${value}`;
}

function invertHandicapCondition(condition: string | undefined) {
  if (!condition) return condition;

  return condition.replace(/[+-]?\d+(?:\.\d+)?/g, invertSignedNumber);
}

function localizedSelectionName(
  selection: HkjcSelection | undefined,
  match: Match,
  pool: HkjcPool
) {
  const value = selectionName(selection);
  const normalizedValue = normalizeName(value || selection?.str || "");

  if (
    ["HIL", "FHL", "CHL", "FCH", "FHC", "CHD"].includes(pool.oddsType) &&
    (["high", "hi", "over", "h"].includes(normalizedValue) ||
      normalizedValue.includes("大"))
  ) {
    return "大";
  }
  if (
    ["HIL", "FHL", "CHL", "FCH", "FHC", "CHD"].includes(pool.oddsType) &&
    (["low", "lo", "under", "l"].includes(normalizedValue) ||
      normalizedValue.includes("細"))
  ) {
    return "細";
  }
  if (["home", "h"].includes(normalizedValue) || normalizedValue.includes("主隊")) {
    return match.home_team;
  }
  if (["away", "a"].includes(normalizedValue) || normalizedValue.includes("客隊")) {
    return match.away_team;
  }
  if (["draw", "d"].includes(normalizedValue) || normalizedValue === "和") {
    return "和局";
  }

  return value;
}

function halfFullLabel(value: string) {
  return value
    .split(/[:/]/)
    .map((char) => {
      if (char === "H") return "主";
      if (char === "A") return "客";
      if (char === "D") return "和";
      return char;
    })
    .join("/");
}

function playerPropPrefix(pool: HkjcPool) {
  if (pool.oddsType === "FGS") return "首名入球";
  if (pool.oddsType === "AGS") return "入球";
  if (pool.oddsType === "LGS") return "最後入球";
  if (pool.oddsType === "NTS") return "不入球";

  return null;
}

function handicapPrefix(pool: HkjcPool) {
  if (pool.oddsType === "HDC" || pool.oddsType === "HHA") return "全場";
  if (pool.oddsType === "FHH") return "半場";

  return null;
}

function hiLoPrefix(pool: HkjcPool) {
  if (pool.oddsType === "HIL") return "全場";
  if (pool.oddsType === "FHL") return "半場";

  return null;
}

function compactLabel(parts: Array<string | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part, index, array) => array.indexOf(part) === index)
    .join(" ");
}

function selectionLabel(
  match: Match,
  pool: HkjcPool,
  line: HkjcLine,
  combination: HkjcCombination
) {
  const selections = combination.selections ?? [];
  if (pool.oddsType === "HFT" || pool.oddsType === "FHA") {
    return halfFullLabel(combination.str ?? selectionName(selections[0]) ?? "");
  }

  const propPrefix = playerPropPrefix(pool);
  const hdcPrefix = handicapPrefix(pool);
  const hiLoScope = hiLoPrefix(pool);
  const selectionText =
    selections
      .map((selection) => localizedSelectionName(selection, match, pool))
      .filter(Boolean)
      .join(" / ") ||
    combination.str ||
    "";
  const selectedFirstName = selections[0]
    ? normalizeName(selections[0].str || selectionName(selections[0]) || "")
    : "";
  const condition =
    pool.oddsType === "HDC" || pool.oddsType === "HHA" || pool.oddsType === "FHH"
      ? ["away", "a"].includes(selectedFirstName)
        ? invertHandicapCondition(line.condition)
        : line.condition
      : pool.oddsType === "HIL" ||
        pool.oddsType === "FHL" ||
        pool.oddsType === "CHL" ||
        pool.oddsType === "FCH" ||
        pool.oddsType === "FHC" ||
        pool.oddsType === "CHD"
      ? line.condition
      : undefined;

  return compactLabel([
    propPrefix
      ? `${propPrefix}：${selectionText}`
      : hdcPrefix
      ? `${hdcPrefix}讓球：${selectionText}`
      : hiLoScope
      ? `${hiLoScope}入球大細：${selectionText}`
      : selectionText,
    condition,
    propPrefix || hdcPrefix || hiLoScope ? undefined : pool.name_ch || pool.name_en,
  ]);
}

function optionFromHkjcPool(
  match: Match,
  hkjcMatch: HkjcMatch,
  pool: HkjcPool
): BetOption[] {
  if (!isOpenStatus(pool.status)) return [];

  const bet_type = BET_TYPE_BY_HKJC_ODDS_TYPE[pool.oddsType] ?? "特別盤";

  return (pool.lines ?? [])
    .filter((line) => isOpenStatus(line.status))
    .flatMap((line) =>
      (line.combinations ?? []).map((combination) => {
        if (!isOpenStatus(combination.status)) return null;

        const odds = parseOdds(combination.currentOdds);
        if (!odds) return null;

        const selection = selectionLabel(match, pool, line, combination);
        if (!selection) return null;

        return {
          id: `hkjc-${hkjcMatch.id}-${pool.id}-${line.lineId ?? "line"}-${
            combination.combId ?? combination.str ?? selection
          }`,
          market: pool.name_ch || pool.name_en || pool.oddsType,
          bet_type,
          selection,
          odds,
          updated_at: pool.updateAt || hkjcMatch.updateAt || null,
        };
      })
    )
    .filter((option): option is BetOption => option !== null);
}

async function fetchHkjcFootballMatchesUncached(oddsTypes: HkjcOddsType[]) {
  const response = await fetch(HKJC_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      origin: HKJC_FOOTBALL_ORIGIN,
      priority: "u=1, i",
      referer: HKJC_FOOTBALL_REFERER,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({
      operationName: "matchList",
      query: HKJC_MATCH_QUERY,
      variables: {
        fbOddsTypes: oddsTypes,
        fbOddsTypesM: oddsTypes,
        startDate: null,
        endDate: null,
        matchIds: null,
        tournIds: null,
        inplayOnly: false,
        featuredMatchesOnly: false,
        frontEndIds: null,
        earlySettlementOnly: false,
        showAllMatch: false,
        startIndex: null,
        endIndex: null,
      },
    }),
    next: { revalidate: 60 },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as HkjcGraphqlResponse;
  if (data.errors?.length) {
    console.warn(
      "HKJC odds fetch failed:",
      data.errors.map((error) => error.message).join("; ")
    );
    return [];
  }

  return data.data?.matches ?? [];
}

const fetchHkjcFootballMatches = unstable_cache(
  fetchHkjcFootballMatchesUncached,
  ["hkjc-football-odds"],
  { revalidate: 60 }
);

// ---------------------------------------------------------------------------
// Outright / tournament markets (冠軍, 神射手, …). These are not tied to a
// single fixture, so they are surfaced as "virtual" matches whose
// external_match_id is `hkjc-outright-<oddsType>-<poolId>`.
// ---------------------------------------------------------------------------

export const OUTRIGHT_PREFIX = "hkjc-outright-";
const OUTRIGHT_ODDS_TYPES = ["CHP", "TPS"] as const;

type HkjcTournament = {
  id: string;
  name_en?: string;
  name_ch?: string;
  foPools?: HkjcPool[];
};

const HKJC_OUTRIGHT_QUERY = `query tournamentList($fbOddsTypes: [FBOddsType]!, $tournId: String, $tournProfileId: String, $subType: Int, $tournIds: [String]) {
  tournaments(fbOddsTypes: $fbOddsTypes, tournId: $tournId, tournProfileId: $tournProfileId, subType: $subType, tournIds: $tournIds) {
    id nameProfileId frontEndId code sequence name_en name_ch isInteractiveServiceAvailable
    poolInfo { normalPools inplayPools sellingPools }
    foPools(fbOddsTypes: $fbOddsTypes) {
      id instNo oddsType status name_en name_ch inplay expectedSuspendDateTime chpType
      lines { lineId status combinations { combId str status currentOdds selections { selId name_en name_ch str sequence } } }
      match { id status homeTeam { name_en } }
    }
  }
}`;

async function fetchHkjcOutrightTournamentsUncached(oddsType: string) {
  const response = await fetch(HKJC_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      origin: HKJC_FOOTBALL_ORIGIN,
      priority: "u=1, i",
      referer: HKJC_FOOTBALL_REFERER,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({
      operationName: "tournamentList",
      query: HKJC_OUTRIGHT_QUERY,
      variables: {
        fbOddsTypes: [oddsType],
        tournId: null,
        tournProfileId: null,
        subType: null,
        tournIds: null,
      },
    }),
    next: { revalidate: 60 },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as {
    data?: { tournaments?: HkjcTournament[] | null };
    errors?: Array<{ message?: string }>;
  };
  if (data.errors?.length) {
    console.warn(
      "HKJC outright fetch failed:",
      data.errors.map((error) => error.message).join("; ")
    );
    return [];
  }

  return data.data?.tournaments ?? [];
}

const fetchHkjcOutrightTournaments = unstable_cache(
  fetchHkjcOutrightTournamentsUncached,
  ["hkjc-outright-odds"],
  { revalidate: 60 }
);

function outrightBetType(oddsType: string): BetOption["bet_type"] {
  return oddsType === "CHP" ? "冠軍" : "特別盤";
}

function outrightOptionsFromPool(pool: HkjcPool): BetOption[] {
  const bet_type = outrightBetType(pool.oddsType);

  return (pool.lines ?? [])
    .filter((line) => isOpenStatus(line.status))
    .flatMap((line) =>
      (line.combinations ?? []).map((combination) => {
        if (!isOpenStatus(combination.status)) return null;

        const odds = parseOdds(combination.currentOdds);
        if (!odds) return null;

        const selection =
          (combination.selections ?? [])
            .map((s) => s.name_ch || s.name_en || s.str)
            .filter(Boolean)
            .join(" / ") ||
          combination.str ||
          "";
        if (!selection) return null;

        return {
          id: `hkjc-out-${pool.id}-${combination.combId ?? selection}`,
          market: pool.name_ch || pool.name_en || pool.oddsType,
          bet_type,
          selection,
          odds,
          updated_at: pool.updateAt || null,
        };
      })
    )
    .filter((option): option is BetOption => option !== null);
}

// Pools available for creating/refreshing virtual "special" matches.
export async function getOutrightMarketsForSync() {
  const tournaments = (
    await Promise.all(
      OUTRIGHT_ODDS_TYPES.map((oddsType) =>
        fetchHkjcOutrightTournaments(oddsType)
      )
    )
  ).flat();

  const markets: Array<{
    externalId: string;
    oddsType: string;
    poolId: string;
    marketName: string;
    tournamentName: string;
    suspendAt: string | null;
  }> = [];

  for (const tournament of tournaments) {
    for (const pool of tournament.foPools ?? []) {
      if (outrightOptionsFromPool(pool).length === 0) continue;
      markets.push({
        externalId: `${OUTRIGHT_PREFIX}${pool.oddsType}-${pool.id}`,
        oddsType: pool.oddsType,
        poolId: pool.id,
        marketName: pool.name_ch || pool.name_en || pool.oddsType,
        tournamentName: tournament.name_ch || tournament.name_en || "特別項目",
        suspendAt: pool.expectedSuspendDateTime || null,
      });
    }
  }

  return markets;
}

async function getOutrightBetOptions(externalMatchId: string) {
  const rest = externalMatchId.slice(OUTRIGHT_PREFIX.length);
  const separator = rest.indexOf("-");
  if (separator < 0) return [];
  const oddsType = rest.slice(0, separator);
  const poolId = rest.slice(separator + 1);

  const tournaments = await fetchHkjcOutrightTournaments(oddsType);
  for (const tournament of tournaments) {
    const pool = (tournament.foPools ?? []).find((p) => p.id === poolId);
    if (pool) {
      return outrightOptionsFromPool(pool).sort(
        (a, b) => a.odds - b.odds
      );
    }
  }
  return [];
}

function mergeHkjcMatches(existing: HkjcMatch[], incoming: HkjcMatch[]) {
  const byId = new Map(existing.map((match) => [match.id, match]));

  for (const match of incoming) {
    const current = byId.get(match.id);
    if (!current) {
      byId.set(match.id, match);
      continue;
    }

    const seenPoolIds = new Set((current.foPools ?? []).map((pool) => pool.id));
    current.foPools = [
      ...(current.foPools ?? []),
      ...(match.foPools ?? []).filter((pool) => !seenPoolIds.has(pool.id)),
    ];
  }

  return Array.from(byId.values());
}

function uniqueOptions(options: BetOption[]) {
  const seen = new Set<string>();

  return options.filter((option) => {
    const key = `${option.bet_type}|${option.selection}|${option.odds}`;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

export async function getBetOptionsForMatches(matches: Match[]) {
  if (matches.length === 0) return {};

  try {
    const hkjcMatches = (
      await Promise.all(
        chunks(HKJC_ODDS_TYPES, HKJC_ODDS_BATCH_SIZE).map((oddsTypes) =>
          fetchHkjcFootballMatches(oddsTypes)
        )
      )
    ).reduce<HkjcMatch[]>(
      (merged, batchMatches) => mergeHkjcMatches(merged, batchMatches),
      []
    );

    const optionsByMatchId: Record<string, BetOption[]> = {};
    for (const match of matches) {
      const matchingHkjcMatches = matchingHkjcMatchesForLocalMatch(
        hkjcMatches,
        match
      );
      const options = uniqueOptions(
        matchingHkjcMatches.flatMap((hkjcMatch) =>
          (hkjcMatch.foPools ?? []).flatMap((pool) =>
            optionFromHkjcPool(match, hkjcMatch, pool)
          )
        )
      ).sort((a, b) =>
          a.bet_type === b.bet_type
            ? a.selection.localeCompare(b.selection)
            : a.bet_type.localeCompare(b.bet_type)
        );

      if (options.length > 0) {
        optionsByMatchId[match.id] = options;
      }
    }

    return optionsByMatchId;
  } catch (error) {
    console.warn("HKJC odds fetch failed:", error);
    return {};
  }
}

export async function getBetOptionsForMatch(
  matchId: string,
  betType?: BetOption["bet_type"]
) {
  if (!matchId) return [];

  const oddsTypes = betType
    ? ODDS_TYPES_BY_BET_TYPE[betType] ?? HKJC_ODDS_TYPES
    : HKJC_ODDS_TYPES;
  const supabase = await createClient();
  const { data: match, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();

  if (error || !match || !isMatchBettable(match)) return [];

  // Outright markets (冠軍 / 神射手 …) are virtual matches; fetch their odds
  // from HKJC's tournament feed instead of matching by team name.
  if (match.external_match_id?.startsWith(OUTRIGHT_PREFIX)) {
    const options = await getOutrightBetOptions(match.external_match_id);
    return betType ? options.filter((o) => o.bet_type === betType) : options;
  }

  const hkjcMatches = (
    await Promise.all(
      chunks(oddsTypes, HKJC_ODDS_BATCH_SIZE).map((chunk) =>
        fetchHkjcFootballMatches(chunk)
      )
    )
  ).reduce<HkjcMatch[]>(
    (merged, batchMatches) => mergeHkjcMatches(merged, batchMatches),
    []
  );
  const matchingHkjcMatches = matchingHkjcMatchesForLocalMatch(
    hkjcMatches,
    match
  );

  return uniqueOptions(
    matchingHkjcMatches.flatMap((hkjcMatch) =>
      (hkjcMatch.foPools ?? []).flatMap((pool) =>
        optionFromHkjcPool(match, hkjcMatch, pool)
      )
    )
  )
    .filter((option) => (betType ? option.bet_type === betType : true))
    .sort((a, b) =>
      a.bet_type === b.bet_type
        ? a.selection.localeCompare(b.selection)
        : a.bet_type.localeCompare(b.bet_type)
    );
}
