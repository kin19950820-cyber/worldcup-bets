"use server";

import type { BetOption, Match } from "@/lib/types";

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
const HKJC_FOOTBALL_REFERER = "https://football.hkjc.com/en-us/home";
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

const HKJC_MATCH_QUERY = `
query matchList($startIndex: Int, $endIndex: Int, $startDate: String, $endDate: String, $matchIds: [String], $tournIds: [String], $fbOddsTypes: [FBOddsType]!, $fbOddsTypesM: [FBOddsType]!, $inplayOnly: Boolean, $featuredMatchesOnly: Boolean, $frontEndIds: [String], $earlySettlementOnly: Boolean, $showAllMatch: Boolean) {
  matches(startIndex: $startIndex, endIndex: $endIndex, startDate: $startDate, endDate: $endDate, matchIds: $matchIds, tournIds: $tournIds, fbOddsTypes: $fbOddsTypesM, inplayOnly: $inplayOnly, featuredMatchesOnly: $featuredMatchesOnly, frontEndIds: $frontEndIds, earlySettlementOnly: $earlySettlementOnly, showAllMatch: $showAllMatch) {
    id
    frontEndId
    matchDate
    kickOffTime
    status
    updateAt
    homeTeam {
      name_en
      name_ch
    }
    awayTeam {
      name_en
      name_ch
    }
    tournament {
      code
      name_en
      name_ch
    }
    foPools(fbOddsTypes: $fbOddsTypes) {
      id
      status
      oddsType
      name_ch
      name_en
      updateAt
      lines {
        lineId
        status
        condition
        main
        combinations {
          combId
          str
          status
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
  CRS: "波膽",
  FCS: "波膽",
  FHA: "半全場",
  HFT: "半全場",
  FHL: "入球大細",
  TTG: "入球大細",
  FTS: "首名入球",
  FGS: "首名入球",
  AGS: "球員表現",
  LGS: "首名入球",
  NTS: "球員表現",
  CHL: "其他",
  FCH: "其他",
  FHC: "其他",
  CHD: "其他",
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
  "Korea Republic": ["South Korea", "南韓", "韓國"],
  "South Korea": ["Korea Republic", "南韓", "韓國"],
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

function hkjcMatchMatchesLocalMatch(hkjcMatch: HkjcMatch, match: Match) {
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

  return homeMatches && awayMatches;
}

function hktDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function matchDateRange(matches: Match[]) {
  const dates = matches.map((match) => hktDate(match.kickoff_time)).sort();
  return {
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
  };
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function isOpenStatus(status: string | undefined) {
  return !status || ["AVAILABLE", "SELLING", "OPEN"].includes(status);
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

function compactLabel(parts: Array<string | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part, index, array) => array.indexOf(part) === index)
    .join(" ");
}

function selectionLabel(
  pool: HkjcPool,
  line: HkjcLine,
  combination: HkjcCombination
) {
  const selections = combination.selections ?? [];
  const selectionText =
    selections.map(selectionName).filter(Boolean).join(" / ") ||
    combination.str ||
    "";
  const condition =
    pool.oddsType === "HDC" ||
    pool.oddsType === "HHA" ||
    pool.oddsType === "HIL" ||
    pool.oddsType === "FHL" ||
    pool.oddsType === "CHL" ||
    pool.oddsType === "FCH" ||
    pool.oddsType === "FHH" ||
    pool.oddsType === "FHC" ||
    pool.oddsType === "CHD"
      ? line.condition
      : undefined;

  return compactLabel([selectionText, condition, pool.name_ch || pool.name_en]);
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

        const selection = selectionLabel(pool, line, combination);
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

async function fetchHkjcFootballMatches(
  oddsTypes: HkjcOddsType[],
  matches: Match[]
) {
  const { startDate, endDate } = matchDateRange(matches);
  const response = await fetch(HKJC_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      origin: "https://football.hkjc.com",
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
        startDate,
        endDate,
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

export async function getBetOptionsForMatches(matches: Match[]) {
  if (matches.length === 0) return {};

  try {
    let hkjcMatches: HkjcMatch[] = [];
    for (const oddsTypes of chunks(HKJC_ODDS_TYPES, HKJC_ODDS_BATCH_SIZE)) {
      const batchMatches = await fetchHkjcFootballMatches(oddsTypes, matches);
      hkjcMatches = mergeHkjcMatches(hkjcMatches, batchMatches);
    }

    const optionsByMatchId: Record<string, BetOption[]> = {};
    for (const match of matches) {
      const matchingHkjcMatches = hkjcMatches.filter((hkjcMatch) =>
        hkjcMatchMatchesLocalMatch(hkjcMatch, match)
      );
      const options = matchingHkjcMatches
        .flatMap((hkjcMatch) =>
          (hkjcMatch.foPools ?? []).flatMap((pool) =>
            optionFromHkjcPool(match, hkjcMatch, pool)
          )
        )
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
  } catch (error) {
    console.warn("HKJC odds fetch failed:", error);
    return {};
  }
}
