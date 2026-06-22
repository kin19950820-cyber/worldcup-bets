"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import toast from "react-hot-toast";
import {
  createBet,
  createParlay,
  type ParlayLegInput,
} from "@/lib/actions/bets";
import { getBetOptionsForMatch } from "@/lib/actions/odds";
import { BET_TYPES, type BetOption, type BetType, type Match } from "@/lib/types";
import { formatCurrency, formatHKTime, cn } from "@/lib/utils";

interface BetFormProps {
  matches: Match[];
  currentBalance: number;
}

type Mode = "single" | "parlay";
type EditableLeg = {
  key: number;
  match_id: string;
  bet_type: Exclude<BetType, "過關"> | "";
  selection: string;
  odds: string;
  option_id: string;
};
type MarketGroup = {
  key: string;
  type: Exclude<BetType, "過關">;
  title: string;
  options: BetOption[];
};

const SINGLE_BET_TYPES = BET_TYPES.filter(
  (type): type is Exclude<BetType, "過關"> => type !== "過關"
);
function displaySelectionLabel(selection: string, marketTitle: string) {
  return selection
    .replace(new RegExp(`^${marketTitle}[：:\\s]*`), "")
    .replace(/^全場波膽[：:\s]*/, "")
    .replace(/^半場波膽[：:\s]*/, "")
    .replace(/^全場角球[：:\s]*/, "")
    .replace(/^全場角球\s*·\s*/, "")
    .replace(/^半場角球[：:\s]*/, "")
    .replace(/^半場角球\s*·\s*/, "")
    .replace(/^全場開出角球大細[：:\s]*/, "")
    .replace(/^開出角球大細[：:\s]*/, "")
    .replace(/^球隊開出角球大細[：:\s]*/, "")
    .replace(/^半場開出角球大細[：:\s]*/, "")
    .replace(/^球隊半場開出角球大細[：:\s]*/, "")
    .replace(/^開出角球讓球[：:\s]*/, "")
    .replace(/^半場開出角球讓球[：:\s]*/, "")
    .replace(/^全場讓球[：:\s]*/, "")
    .replace(/^半場讓球[：:\s]*/, "")
    .replace(/^首名入球[：:\s]*/, "")
    .replace(/^首隊入球[：:\s]*/, "")
    .replace(/^主客和[：:\s]*/, "")
    .replace(/^半場主客和[：:\s]*/, "")
    .replace(/^讓球主客和[：:\s]*/, "")
    .trim();
}

function splitByPrefix(
  type: Exclude<BetType, "過關">,
  typeOptions: BetOption[],
  configs: Array<{ prefix: string; title: string; key: string }>
) {
  const groups: MarketGroup[] = [];
  const used = new Set<string>();

  for (const config of configs) {
    const options = typeOptions.filter((option) =>
      option.selection.startsWith(config.prefix)
    );
    options.forEach((option) => used.add(option.id));

    if (options.length > 0) {
      groups.push({
        key: `${type}:${config.key}`,
        type,
        title: config.title,
        options,
      });
    }
  }

  const others = typeOptions.filter((option) => !used.has(option.id));
  if (others.length > 0) {
    groups.push({ key: type, type, title: type, options: others });
  }

  return groups;
}

function splitCornerGroups(
  type: Exclude<BetType, "過關">,
  typeOptions: BetOption[],
  half: boolean
) {
  const scopeTitle = half ? "半場角球" : "全場角球";
  const totalTitle = half ? "半場開出角球大細" : "開出角球大細";
  const teamTotalTitle = half
    ? "球隊半場開出角球大細"
    : "球隊開出角球大細";
  const handicapTitle = half ? "半場開出角球讓球" : "開出角球讓球";
  const isTeamOption = (option: BetOption) =>
    option.selection.includes("主隊") ||
    option.selection.includes("客隊") ||
    /[A-Za-z\u4e00-\u9fff].*[+-]\d/.test(option.selection);
  const isHiLoOption = (option: BetOption) =>
    option.selection.includes("大") || option.selection.includes("細");
  const isHandicapOption = (option: BetOption) =>
    isTeamOption(option) && !isHiLoOption(option);
  const isTeamHiLoOption = (option: BetOption) =>
    isTeamOption(option) && isHiLoOption(option);
  const isTotalHiLoOption = (option: BetOption) =>
    !isTeamOption(option) && isHiLoOption(option);
  const groups: MarketGroup[] = [];

  const totalHiLo = typeOptions.filter(isTotalHiLoOption);
  const teamHiLo = typeOptions.filter(isTeamHiLoOption);
  const handicap = typeOptions.filter(isHandicapOption);
  const usedIds = new Set(
    [...totalHiLo, ...teamHiLo, ...handicap].map((option) => option.id)
  );
  const others = typeOptions.filter((option) => !usedIds.has(option.id));

  if (totalHiLo.length > 0) {
    groups.push({
      key: `${type}:total-hilo`,
      type,
      title: totalTitle,
      options: totalHiLo,
    });
  }
  if (teamHiLo.length > 0) {
    groups.push({
      key: `${type}:team-hilo`,
      type,
      title: teamTotalTitle,
      options: teamHiLo,
    });
  }
  if (handicap.length > 0) {
    groups.push({
      key: `${type}:handicap`,
      type,
      title: handicapTitle,
      options: handicap,
    });
  }
  if (others.length > 0) {
    groups.push({
      key: `${type}:other`,
      type,
      title: scopeTitle,
      options: others,
    });
  }

  return groups;
}

function hasRenderableOption(option: BetOption) {
  const selection = option.selection.trim();
  return Boolean(selection) && Number.isFinite(option.odds) && option.odds > 1;
}

function scoreFromSelection(selection: string) {
  const match = selection.match(/(\d+)\s*[:：-]\s*(\d+)/);
  if (!match) return null;

  return {
    home: Number(match[1]),
    away: Number(match[2]),
  };
}

function scoreColumn(option: BetOption) {
  const score = scoreFromSelection(option.selection);
  if (!score) return "other" as const;
  if (score.home > score.away) return "home" as const;
  if (score.home === score.away) return "draw" as const;
  return "away" as const;
}

function scoreSort(a: BetOption, b: BetOption) {
  const scoreA = scoreFromSelection(a.selection);
  const scoreB = scoreFromSelection(b.selection);
  if (!scoreA || !scoreB) return a.selection.localeCompare(b.selection);

  const totalA = scoreA.home + scoreA.away;
  const totalB = scoreB.home + scoreB.away;
  if (totalA !== totalB) return totalA - totalB;
  if (scoreA.home !== scoreB.home) return scoreA.home - scoreB.home;
  return scoreA.away - scoreB.away;
}

function normalizedSelection(option: BetOption, title: string) {
  return displaySelectionLabel(option.selection, title) || option.selection;
}

function optionSide(option: BetOption, match?: Match) {
  const label = option.selection;
  const cleaned = displaySelectionLabel(option.selection, option.bet_type);
  if (match?.home_team && label.includes(match.home_team)) return "home";
  if (match?.away_team && label.includes(match.away_team)) return "away";
  if (/^(主|主勝|H|Home)(\b|$)/i.test(cleaned)) return "home";
  if (/^(客|客勝|A|Away)(\b|$)/i.test(cleaned)) return "away";
  if (/^(和|和局|D|Draw)(\b|$)/i.test(cleaned) || label.includes("和")) return "draw";
  if (cleaned.includes("大") || label.includes("大")) return "over";
  if (cleaned.includes("細") || label.includes("細")) return "under";
  return "other";
}

function lineValueFromLabel(label: string, title?: string) {
  const cleaned = title ? displaySelectionLabel(label, title) : label;
  const bracketValue = cleaned.match(/\[[^\]]+\]/)?.[0];
  if (bracketValue) return bracketValue;

  const signedPair = cleaned.match(/[+-]?\d+(?:\.\d+)?\s*\/\s*[+-]?\d+(?:\.\d+)?/);
  if (signedPair) return `[${signedPair[0].replace(/\s+/g, "")}]`;

  const signedNumber = cleaned.match(/[+-]\d+(?:\.\d+)?/);
  if (signedNumber) return `[${signedNumber[0]}]`;

  const plainLine = cleaned.match(/\b\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\b/);
  if (plainLine && (title?.includes("入球") || title?.includes("角球"))) {
    return `[${plainLine[0].replace(/\s+/g, "")}]`;
  }

  return "";
}

function isHomeDrawAwayMarket(type: Exclude<BetType, "過關">) {
  return ["主客和", "半場主客和", "讓球主客和"].includes(type);
}

function isFirstTeamToScoreMarket(type: Exclude<BetType, "過關">, title: string) {
  return type === "首名入球" || title === "首隊入球";
}

function isTwoWayLineMarket(type: Exclude<BetType, "過關">, title: string) {
  return (
    type === "讓球" ||
    type === "入球大細" ||
    title.includes("角球") ||
    title.includes("入球大細")
  );
}

function splitDisplayMarketGroups(options: BetOption[]): MarketGroup[] {
  const groups: MarketGroup[] = [];
  const renderableOptions = options.filter(hasRenderableOption);
  const cornerOptions = renderableOptions.filter(
    (option) =>
      option.bet_type === "全場角球" || option.bet_type === "半場角球"
  );
  const halfCornerOptions = cornerOptions.filter(
    (option) =>
      option.bet_type === "半場角球" || option.selection.includes("半場")
  );
  const halfCornerIds = new Set(halfCornerOptions.map((option) => option.id));
  const fullCornerOptions = cornerOptions.filter(
    (option) => !halfCornerIds.has(option.id)
  );

  if (fullCornerOptions.length > 0) {
    groups.push(...splitCornerGroups("全場角球", fullCornerOptions, false));
  }
  if (halfCornerOptions.length > 0) {
    groups.push(...splitCornerGroups("半場角球", halfCornerOptions, true));
  }

  for (const type of SINGLE_BET_TYPES) {
    if (type === "全場角球" || type === "半場角球") continue;

    const typeOptions = renderableOptions.filter(
      (option) => option.bet_type === type
    );
    if (typeOptions.length === 0) continue;

    if (type === "入球大細") {
      groups.push(
        ...splitByPrefix(type, typeOptions, [
          { prefix: "全場入球大細", title: "入球大細", key: "全場" },
          { prefix: "半場入球大細", title: "半場入球大細", key: "半場" },
        ])
      );
      continue;
    }

    if (type === "讓球") {
      groups.push(
        ...splitByPrefix(type, typeOptions, [
          { prefix: "全場讓球", title: "讓球", key: "全場" },
          { prefix: "半場讓球", title: "半場讓球", key: "半場" },
        ])
      );
      continue;
    }

    if (type === "首名入球") {
      groups.push({
        key: type,
        type,
        title: "首隊入球",
        options: typeOptions,
      });
      continue;
    }

    groups.push({ key: type, type, title: type, options: typeOptions });
  }

  return groups;
}

const QUICK_MARKET_TABS = [
  { key: "全部", label: "全部" },
  { key: "主客和", label: "主客和" },
  { key: "讓球", label: "讓球" },
  { key: "大小球", label: "大小球" },
  { key: "角球", label: "角球" },
] as const;

const QUICK_MARKET_KEY_SET = new Set<string>(QUICK_MARKET_TABS.map((t) => t.key));

let nextLegKey = 1;

function newLeg(): EditableLeg {
  return {
    key: nextLegKey++,
    match_id: "",
    bet_type: "",
    selection: "",
    odds: "",
    option_id: "",
  };
}

export default function BetForm({ matches, currentBalance }: BetFormProps) {
  const [mode, setMode] = useState<Mode>("single");
  const [pending, startTransition] = useTransition();
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [stake, setStake] = useState("");
  const [betType, setBetType] = useState<Exclude<BetType, "過關"> | "">(
    "主客和"
  );
  const [selectedMarketKey, setSelectedMarketKey] = useState("全部");
  const [selection, setSelection] = useState("");
  const [odds, setOdds] = useState("");
  const [matchId, setMatchId] = useState(matches[0]?.id ?? "");
  const [optionId, setOptionId] = useState("");
  const [legs, setLegs] = useState<EditableLeg[]>([newLeg(), newLeg()]);
  const [oddsOptionsByMatchId, setOddsOptionsByMatchId] = useState<
    Record<string, BetOption[]>
  >({});
  const [loadingMatchIds, setLoadingMatchIds] = useState<string[]>([]);
  const [loadingMarketKeys, setLoadingMarketKeys] = useState<string[]>([]);

  const stakeNum = Number(stake) || 0;
  const singleOdds = Number(odds) || 0;
  const totalOdds = useMemo(
    () =>
      legs.reduce((product, leg) => {
        const legOdds = Number(leg.odds);
        return product * (legOdds > 1 ? legOdds : 1);
      }, 1),
    [legs]
  );
  const possibleReturn =
    stakeNum > 0
      ? stakeNum * (mode === "single" ? singleOdds : totalOdds)
      : 0;
  const visibleMatches = showAllMatches ? matches : matches.slice(0, 6);
  const selectedMatch = matches.find((match) => match.id === matchId);
  const selectedMatchOptions =
    matchId ? oddsOptionsByMatchId[matchId] ?? [] : [];
  const allSingleMarketGroups = splitDisplayMarketGroups(selectedMatchOptions);
  const singleMarketGroups =
    selectedMarketKey === "全部"
      ? allSingleMarketGroups
      : selectedMarketKey === "大小球"
      ? allSingleMarketGroups.filter((g) => g.type === "入球大細")
      : selectedMarketKey === "角球"
      ? allSingleMarketGroups.filter(
          (g) => g.type === "全場角球" || g.type === "半場角球"
        )
      : selectedMarketKey === "主客和" || selectedMarketKey === "讓球"
      ? allSingleMarketGroups.filter((g) => g.type === selectedMarketKey)
      : allSingleMarketGroups.filter((g) => g.key === selectedMarketKey);
  const isLoadingMatchOdds = (selectedMatchId: string) =>
    loadingMatchIds.includes(selectedMatchId);
  const marketKey = (selectedMatchId: string, selectedBetType: string) =>
    `${selectedMatchId}:${selectedBetType}`;
  const isLoadingMarketOdds = (
    selectedMatchId: string,
    selectedBetType: string
  ) => loadingMarketKeys.includes(marketKey(selectedMatchId, selectedBetType));
  const getFilteredOptions = (selectedMatchId: string, selectedBetType: string) =>
    selectedMatchId && selectedBetType
      ? (oddsOptionsByMatchId[selectedMatchId] ?? []).filter(
          (option) => option.bet_type === selectedBetType
        )
      : [];

  const mergeMatchOptions = (selectedMatchId: string, options: BetOption[]) => {
    setOddsOptionsByMatchId((current) => {
      const merged = new Map(
        [...(current[selectedMatchId] ?? []), ...options].map((option) => [
          option.id,
          option,
        ])
      );

      return {
        ...current,
        [selectedMatchId]: Array.from(merged.values()).sort((a, b) =>
          a.bet_type === b.bet_type
            ? a.selection.localeCompare(b.selection)
            : a.bet_type.localeCompare(b.bet_type)
        ),
      };
    });
  };

  const loadMatchOddsOptions = async (selectedMatchId: string) => {
    if (!selectedMatchId) return;
    if (
      oddsOptionsByMatchId[selectedMatchId] ||
      loadingMatchIds.includes(selectedMatchId)
    ) {
      return;
    }

    setLoadingMatchIds((current) => [...current, selectedMatchId]);
    try {
      const options = await getBetOptionsForMatch(selectedMatchId);
      mergeMatchOptions(selectedMatchId, options);
    } catch {
      toast.error("暫時載入唔到 HKJC 賠率，可手動輸入");
    } finally {
      setLoadingMatchIds((current) =>
        current.filter((item) => item !== selectedMatchId)
      );
    }
  };

  const loadMarketOddsOptions = async (
    selectedMatchId: string,
    selectedBetType: Exclude<BetType, "過關"> | ""
  ) => {
    if (!selectedMatchId || !selectedBetType) return;
    if (
      (oddsOptionsByMatchId[selectedMatchId] ?? []).some(
        (option) => option.bet_type === selectedBetType
      )
    ) {
      return;
    }

    const key = marketKey(selectedMatchId, selectedBetType);
    if (loadingMarketKeys.includes(key)) return;

    setLoadingMarketKeys((current) => [...current, key]);
    try {
      const options = await getBetOptionsForMatch(
        selectedMatchId,
        selectedBetType
      );
      mergeMatchOptions(selectedMatchId, options);
    } catch {
      toast.error("暫時載入唔到 HKJC 賠率，可手動輸入");
    } finally {
      setLoadingMarketKeys((current) => current.filter((item) => item !== key));
    }
  };

  useEffect(() => {
    void loadMatchOddsOptions(matchId);
  }, [matchId]);

  useEffect(() => {
    void loadMarketOddsOptions(matchId, betType);
  }, [matchId, betType]);

  useEffect(() => {
    legs.forEach((leg) => {
      void loadMatchOddsOptions(leg.match_id);
      void loadMarketOddsOptions(leg.match_id, leg.bet_type);
    });
  }, [legs]);

  useEffect(() => {
    if (
      !QUICK_MARKET_KEY_SET.has(selectedMarketKey) &&
      !allSingleMarketGroups.some((group) => group.key === selectedMarketKey)
    ) {
      setSelectedMarketKey("全部");
    }
  }, [allSingleMarketGroups, selectedMarketKey]);

  const chooseMatch = (id: string) => {
    setMatchId(id);
    setSelection("");
    setOdds("");
    setOptionId("");
  };

  const chooseMarket = (type: Exclude<BetType, "過關">) => {
    setBetType(type);
    setSelection("");
    setOdds("");
    setOptionId("");
  };

  const chooseSingleOption = (option: BetOption) => {
    setOptionId(option.id);
    setBetType(option.bet_type);
    setSelection(option.selection);
    setOdds(option.odds.toString());
  };

  const updateLeg = (
    key: number,
    field: keyof Omit<EditableLeg, "key">,
    value: string
  ) => {
    setLegs((current) =>
      current.map((leg) => (leg.key === key ? { ...leg, [field]: value } : leg))
    );
  };

  const changeLegMatch = (key: number, nextMatchId: string) => {
    setLegs((current) =>
      current.map((leg) =>
        leg.key === key
          ? {
              ...leg,
              match_id: nextMatchId,
              bet_type: "",
              selection: "",
              odds: "",
              option_id: "",
            }
          : leg
      )
    );
  };

  const applyLegOption = (key: number, id: string) => {
    const leg = legs.find((item) => item.key === key);
    const option = leg
      ? getFilteredOptions(leg.match_id, leg.bet_type).find(
          (item) => item.id === id
        )
      : null;

    setLegs((current) =>
      current.map((item) =>
        item.key !== key
          ? item
          : option
          ? {
              ...item,
              option_id: id,
              bet_type: option.bet_type,
              selection: option.selection,
              odds: option.odds.toString(),
            }
          : { ...item, option_id: id }
      )
    );
  };

  const handleSingleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createBet(formData);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `投注成功，剩餘 ${formatCurrency(result.new_balance as number)}`
      );
      setStake("");
      setOdds("");
      setSelection("");
      setOptionId("");
    });
  };

  const handleParlaySubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const input = legs.map((leg) => ({
      match_id: leg.match_id,
      bet_type: leg.bet_type,
      selection: leg.selection,
      odds: Number(leg.odds),
    })) as ParlayLegInput[];

    startTransition(async () => {
      const result = await createParlay(input, stakeNum);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `${legs.length} 關過關投注成功，總賠率 ${result.total_odds}`
      );
      setStake("");
      setLegs([newLeg(), newLeg()]);
    });
  };

  return (
    <div className="space-y-4 pb-52 lg:pb-0">
      <div className="rounded-lg border border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
          <div>
            <p className="text-[11px] font-semibold uppercase text-emerald-300">
              Football
            </p>
            <h2 className="text-sm font-bold text-white">足球投注</h2>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-500">可用餘額</p>
            <p className="font-bold text-white">{formatCurrency(currentBalance)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-slate-800 p-px">
          {(["single", "parlay"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={cn(
                "bg-slate-900 px-3 py-2 text-sm font-semibold transition-colors",
                mode === option
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              {option === "single" ? "單注" : "過關"}
            </button>
          ))}
        </div>
      </div>

      {mode === "single" ? (
        <form onSubmit={handleSingleSubmit}>
          <input type="hidden" name="match_id" value={matchId} />
          <input type="hidden" name="bet_type" value={betType} />
          <input type="hidden" name="selection" value={selection} />
          <input type="hidden" name="odds" value={odds} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="hidden space-y-4 lg:block">
                <MatchBoard
                  matches={visibleMatches}
                  selectedId={matchId}
                  onSelect={chooseMatch}
                />
                {matches.length > 6 && (
                  <button
                    type="button"
                    onClick={() => setShowAllMatches((current) => !current)}
                    className="btn-secondary w-full py-2.5 text-sm"
                  >
                    {showAllMatches
                      ? "只顯示最近 6 場"
                      : `顯示更多賽事（${matches.length - 6}）`}
                  </button>
                )}
              </div>
              {matches.length > 6 && (
                <div className="lg:hidden">
                  <button
                    type="button"
                    onClick={() => setShowAllMatches((current) => !current)}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-200"
                  >
                    {showAllMatches
                      ? "只顯示最近 6 場"
                      : `顯示更多賽事（${matches.length - 6}）`}
                  </button>
                </div>
              )}
              <HkjcOddsBoard
                matches={visibleMatches}
                selectedMatchId={matchId}
                selectedMatch={selectedMatch}
                onMatchSelect={chooseMatch}
                selectedMarketKey={selectedMarketKey}
                onMarketChange={setSelectedMarketKey}
                allMarketGroups={allSingleMarketGroups}
                marketGroups={singleMarketGroups}
                activeOptionId={optionId}
                loading={Boolean(matchId && isLoadingMatchOdds(matchId))}
                onOptionSelect={chooseSingleOption}
                selection={selection}
                odds={odds}
                selectedOptionId={optionId}
                onSelectionChange={(value) => {
                  setSelection(value);
                  setOptionId("");
                }}
                onOddsChange={(value) => {
                  setOdds(value);
                  setOptionId("");
                }}
                onCustomOptionChange={(id) => {
                  const option = selectedMatchOptions.find((item) => item.id === id);
                  if (option) {
                    chooseSingleOption(option);
                  } else {
                    setOptionId("");
                  }
                }}
              />
            </div>

            <Betslip
              mode="single"
              selectedMatch={selectedMatch}
              selection={selection}
              betType={betType}
              odds={singleOdds}
              stake={stake}
              setStake={setStake}
              currentBalance={currentBalance}
              possibleReturn={possibleReturn}
              pending={pending}
              disabled={
                !matchId ||
                !betType ||
                !selection.trim() ||
                stakeNum <= 0 ||
                stakeNum > currentBalance ||
                singleOdds <= 1
              }
            />
          </div>
          <MobileBetslipBar
            mode="single"
            selectedMatch={selectedMatch}
            selection={selection}
            betType={betType}
            odds={singleOdds}
            oddsString={odds}
            stake={stake}
            setStake={setStake}
            currentBalance={currentBalance}
            possibleReturn={possibleReturn}
            pending={pending}
            disabled={
              !matchId ||
              !betType ||
              !selection.trim() ||
              stakeNum <= 0 ||
              stakeNum > currentBalance ||
              singleOdds <= 1
            }
            onSelectionChange={(value) => {
              setSelection(value);
              setOptionId("");
            }}
            onOddsChange={(value) => {
              setOdds(value);
              setOptionId("");
            }}
            selectedMarketKey={selectedMarketKey}
            onMarketChange={setSelectedMarketKey}
            allMarketGroups={allSingleMarketGroups}
            optionGroups={singleMarketGroups}
            selectedOptionId={optionId}
            onOptionChange={(id) => {
              const option = selectedMatchOptions.find((item) => item.id === id);
              if (option) {
                chooseSingleOption(option);
              } else {
                setOptionId("");
              }
            }}
          />
        </form>
      ) : (
        <form onSubmit={handleParlaySubmit}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <ParlayBuilder
              matches={visibleMatches}
              allMatchesCount={matches.length}
              showAllMatches={showAllMatches}
              setShowAllMatches={setShowAllMatches}
              legs={legs}
              availableBetTypes={SINGLE_BET_TYPES}
              currentOptions={oddsOptionsByMatchId}
              loadingMatchIds={loadingMatchIds}
              loadingMarketKeys={loadingMarketKeys}
              onMatchChange={changeLegMatch}
              onLegChange={updateLeg}
              onOptionSelect={applyLegOption}
              onAddLeg={() => setLegs((current) => [...current, newLeg()])}
              onRemoveLeg={(key) =>
                setLegs((current) => current.filter((leg) => leg.key !== key))
              }
            />
            <Betslip
              mode="parlay"
              legs={legs}
              stake={stake}
              setStake={setStake}
              currentBalance={currentBalance}
              possibleReturn={possibleReturn}
              odds={totalOdds}
              pending={pending}
              disabled={
                stakeNum <= 0 ||
                stakeNum > currentBalance ||
                legs.some(
                  (leg) =>
                    !leg.match_id ||
                    !leg.bet_type ||
                    !leg.selection.trim() ||
                    Number(leg.odds) <= 1
                )
              }
            />
          </div>
          <MobileBetslipBar
            mode="parlay"
            legs={legs}
            stake={stake}
            setStake={setStake}
            currentBalance={currentBalance}
            possibleReturn={possibleReturn}
            odds={totalOdds}
            pending={pending}
            disabled={
              stakeNum <= 0 ||
              stakeNum > currentBalance ||
              legs.some(
                (leg) =>
                  !leg.match_id ||
                  !leg.bet_type ||
                  !leg.selection.trim() ||
                  Number(leg.odds) <= 1
              )
            }
          />
        </form>
      )}
    </div>
  );
}

function MatchBoard({
  matches,
  selectedId,
  onSelect,
}: {
  matches: Match[];
  selectedId: string;
  onSelect: (value: string) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950">
      <div className="grid grid-cols-[1fr_76px] border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-400 sm:grid-cols-[1fr_96px]">
        <span>賽事</span>
        <span className="text-right">開賽</span>
      </div>
      <div className="divide-y divide-slate-800">
        {matches.map((match) => (
          <button
            key={match.id}
            type="button"
            onClick={() => onSelect(match.id)}
            className={cn(
              "grid w-full grid-cols-[1fr_76px] items-center gap-2 px-3 py-2.5 text-left transition-colors sm:grid-cols-[1fr_96px] sm:gap-3 sm:py-3",
              selectedId === match.id
                ? "bg-emerald-500/10"
                : "hover:bg-slate-900"
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">
                {match.home_team} 對 {match.away_team}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {match.stage ?? match.group_name ?? "世界盃"}
              </span>
            </span>
            <span className="text-right text-xs font-semibold text-slate-300">
              {formatHKTime(match.kickoff_time, "MM/dd HH:mm")}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function HkjcOddsBoard({
  matches,
  selectedMatchId,
  selectedMatch,
  onMatchSelect,
  selectedMarketKey,
  onMarketChange,
  allMarketGroups,
  marketGroups,
  activeOptionId,
  loading,
  onOptionSelect,
  selection,
  odds,
  selectedOptionId,
  onSelectionChange,
  onOddsChange,
  onCustomOptionChange,
}: {
  matches: Match[];
  selectedMatchId: string;
  selectedMatch?: Match;
  onMatchSelect: (value: string) => void;
  selectedMarketKey: string;
  onMarketChange: (key: string) => void;
  allMarketGroups: MarketGroup[];
  marketGroups: MarketGroup[];
  activeOptionId: string;
  loading: boolean;
  onOptionSelect: (option: BetOption) => void;
  selection: string;
  odds: string;
  selectedOptionId: string;
  onSelectionChange: (value: string) => void;
  onOddsChange: (value: string) => void;
  onCustomOptionChange: (id: string) => void;
}) {
  const lastUpdated = marketGroups
    .flatMap((group) => group.options.map((option) => option.updated_at))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-950 px-3 py-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-slate-400">
            更新時間: {lastUpdated ? formatHKTime(lastUpdated, "dd/MM/yyyy HH:mm") : "--"}
          </span>
          <span className="text-lg leading-none text-emerald-300">↻</span>
        </div>
      </div>

      <div className="border-b border-slate-800 bg-slate-950">
        <label className="sr-only" htmlFor="hkjc-match-select">
          選擇其他賽事
        </label>
        <div className="p-3">
          <div className="relative">
            <select
              id="hkjc-match-select"
              value={selectedMatchId}
              onChange={(event) => onMatchSelect(event.target.value)}
              className="w-full appearance-none rounded-lg border border-emerald-400/60 bg-slate-900 px-4 py-3 pr-10 text-center text-sm font-bold text-white outline-none shadow-inner focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/30"
            >
              {matches.map((match) => (
                <option
                  key={match.id}
                  value={match.id}
                  className="bg-slate-900 text-white"
                >
                  選擇其他賽事 · {match.home_team} 對 {match.away_team}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-300">
              ▼
            </span>
          </div>
        </div>
        <div className="px-3 pb-3 text-center">
          <div className="flex items-center justify-center gap-3 text-base font-bold text-white">
            <span className="min-w-0 truncate">{selectedMatch?.home_team ?? "--"}</span>
            <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400">對</span>
            <span className="min-w-0 truncate">{selectedMatch?.away_team ?? "--"}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{selectedMatch?.external_match_id || "賽事"}</span>
            <span>{selectedMatch?.stage ?? selectedMatch?.group_name ?? "世界盃"}</span>
            <span>
              {selectedMatch
                ? formatHKTime(selectedMatch.kickoff_time, "dd/MM HH:mm")
                : "--"}
            </span>
          </div>
        </div>
      </div>

      <div className="hidden lg:block sticky top-14 z-20 border-b border-slate-800 bg-slate-950 p-2 lg:static">
        <label className="sr-only" htmlFor="hkjc-market-select">
          選擇項目
        </label>
        <select
          id="hkjc-market-select"
          value={selectedMarketKey}
          onChange={(event) => onMarketChange(event.target.value)}
          className="w-full appearance-none rounded border border-slate-700 bg-slate-900 px-3 py-2 text-center text-sm font-bold text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="全部" className="bg-slate-900 text-white">
            全部
          </option>
          {allMarketGroups.map((group) => (
            <option
              key={group.key}
              value={group.key}
              className="bg-slate-900 text-white"
            >
              {group.title}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="bg-slate-900 px-3 py-8 text-center text-sm text-slate-400">
          正在載入 HKJC 賠率...
        </div>
      ) : marketGroups.length > 0 ? (
        marketGroups.map((group) => (
          <OddsCoupon
            key={group.key}
            title={group.title}
            type={group.type}
            match={selectedMatch}
            options={group.options}
            activeOptionId={activeOptionId}
            onOptionSelect={onOptionSelect}
          />
        ))
      ) : (
        <div className="bg-slate-900 px-3 py-4 text-sm text-slate-400">
          暫無 HKJC 市場選項，可用下方自訂投注。
        </div>
      )}

      <div className="border-t border-slate-800 bg-slate-950 p-3">
        <div className="mb-3 hidden lg:block">
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            市場選項
          </label>
          <select
            value={selectedOptionId}
            onChange={(event) => onCustomOptionChange(event.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="" className="bg-slate-900 text-white">
              自訂輸入
            </option>
            {marketGroups.flatMap((group) =>
              group.options.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  className="bg-slate-900 text-white"
                >
                  {group.title} ·{" "}
                  {displaySelectionLabel(option.selection, group.title) ||
                    option.selection}{" "}
                  · 賠率 {option.odds.toFixed(2)}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="hidden lg:grid gap-2 sm:grid-cols-[1fr_120px]">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">
              自訂投注選項
            </label>
            <input
              type="text"
              maxLength={100}
              value={selection}
              onChange={(event) => onSelectionChange(event.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="例如：主勝、Over 2.5、香港 +0.25"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">
              賠率
            </label>
            <input
              type="number"
              min="1.01"
              step="0.01"
              value={odds}
              onChange={(event) => onOddsChange(event.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="1.85"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function OddsCoupon({
  title,
  type,
  match,
  options,
  activeOptionId,
  onOptionSelect,
}: {
  title: string;
  type: Exclude<BetType, "過關">;
  match?: Match;
  options: BetOption[];
  activeOptionId: string;
  onOptionSelect: (option: BetOption) => void;
}) {
  return (
    <div className="border-t border-slate-800 first:border-t-0">
      <div className="flex items-center justify-between bg-[#3d5a52] px-3 py-2 text-white">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="text-lg leading-none">⌃</span>
      </div>
      {type.includes("波膽") ? (
        <CorrectScoreGrid
          title={title}
          options={options}
          activeOptionId={activeOptionId}
          onOptionSelect={onOptionSelect}
        />
      ) : isHomeDrawAwayMarket(type) ? (
        <HomeDrawAwayGrid
          title={title}
          match={match}
          options={options}
          activeOptionId={activeOptionId}
          onOptionSelect={onOptionSelect}
        />
      ) : isFirstTeamToScoreMarket(type, title) ? (
        <FirstTeamToScoreGrid
          title={title}
          match={match}
          options={options}
          activeOptionId={activeOptionId}
          onOptionSelect={onOptionSelect}
        />
      ) : isTwoWayLineMarket(type, title) ? (
        type === "讓球" ? (
          <HandicapGrid
            title={title}
            match={match}
            options={options}
            activeOptionId={activeOptionId}
            onOptionSelect={onOptionSelect}
          />
        ) : (
          <TwoWayLineGrid
            title={title}
            type={type}
            match={match}
            options={options}
            activeOptionId={activeOptionId}
            onOptionSelect={onOptionSelect}
          />
        )
      ) : (
        <div className="grid grid-cols-3 bg-slate-900">
          {options.map((option, index) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onOptionSelect(option)}
              className={cn(
                "flex min-h-[72px] items-center justify-center gap-1 border-b border-slate-800 px-1 py-2 text-center transition-colors sm:gap-2",
                index % 6 >= 3 ? "bg-slate-800/60" : "bg-slate-900",
                activeOptionId === option.id && "bg-emerald-500/15"
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-xs text-slate-300">
                  {displaySelectionLabel(option.selection, title) ||
                    option.selection}
                </span>
                <span className="mt-1 block text-base font-bold leading-none text-slate-100 sm:text-lg">
                  {option.odds.toFixed(2)}
                </span>
              </span>
              <span
                className={cn(
                  "h-6 w-6 shrink-0 rounded border bg-slate-950 sm:h-7 sm:w-7",
                  activeOptionId === option.id
                    ? "border-emerald-500 bg-emerald-500 shadow-inner"
                    : "border-slate-400"
                )}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CorrectScoreGrid({
  title,
  options,
  activeOptionId,
  onOptionSelect,
}: {
  title: string;
  options: BetOption[];
  activeOptionId: string;
  onOptionSelect: (option: BetOption) => void;
}) {
  const columns = [
    {
      key: "home",
      label: "主",
      options: options.filter((option) => scoreColumn(option) === "home"),
    },
    {
      key: "draw",
      label: "和",
      options: options.filter((option) => scoreColumn(option) === "draw"),
    },
    {
      key: "away",
      label: "客",
      options: options.filter((option) => scoreColumn(option) === "away"),
    },
  ].map((column) => ({
    ...column,
    options: column.options.sort(scoreSort),
  }));
  const otherOptions = options
    .filter((option) => scoreColumn(option) === "other")
    .sort((a, b) => a.selection.localeCompare(b.selection));

  return (
    <div className="bg-slate-900">
      <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-950 text-center text-xs font-semibold text-slate-300">
        {columns.map((column) => (
          <div key={column.key} className="px-2 py-2">
            {column.label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 items-start bg-slate-900">
        {columns.map((column) => (
          <div
            key={column.key}
            className="border-r border-slate-800 last:border-r-0"
          >
            {column.options.map((option) => (
              <ScoreOptionButton
                key={option.id}
                title={title}
                option={option}
                active={activeOptionId === option.id}
                onSelect={onOptionSelect}
              />
            ))}
          </div>
        ))}
      </div>
      {otherOptions.length > 0 && (
        <div className="grid grid-cols-3 border-t border-slate-800 bg-slate-900">
          {otherOptions.map((option) => (
            <ScoreOptionButton
              key={option.id}
              title={title}
              option={option}
              active={activeOptionId === option.id}
              onSelect={onOptionSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HomeDrawAwayGrid({
  title,
  match,
  options,
  activeOptionId,
  onOptionSelect,
}: {
  title: string;
  match?: Match;
  options: BetOption[];
  activeOptionId: string;
  onOptionSelect: (option: BetOption) => void;
}) {
  const columns = [
    {
      key: "home",
      label: match?.home_team ? `${match.home_team} (主隊勝)` : "主",
      option: options.find((option) => optionSide(option, match) === "home"),
    },
    {
      key: "draw",
      label: "和",
      option: options.find((option) => optionSide(option, match) === "draw"),
    },
    {
      key: "away",
      label: match?.away_team ? `${match.away_team} (客隊勝)` : "客",
      option: options.find((option) => optionSide(option, match) === "away"),
    },
  ];
  const others = options.filter(
    (option) => !columns.some((column) => column.option?.id === option.id)
  );

  return (
    <div className="bg-slate-900">
      <div className="grid grid-cols-3 text-center text-xs text-slate-300">
        {columns.map((column) => (
          <div key={column.key} className="px-2 py-3">
            <p className="truncate">{column.label}</p>
            {column.option && (
              <MarketOptionButton
                title={title}
                option={column.option}
                active={activeOptionId === column.option.id}
                onSelect={onOptionSelect}
                compact
              />
            )}
          </div>
        ))}
      </div>
      {others.length > 0 && (
        <div className="grid grid-cols-3 border-t border-slate-800">
          {others.map((option) => (
            <MarketOptionButton
              key={option.id}
              title={title}
              option={option}
              active={activeOptionId === option.id}
              onSelect={onOptionSelect}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FirstTeamToScoreGrid({
  title,
  match,
  options,
  activeOptionId,
  onOptionSelect,
}: {
  title: string;
  match?: Match;
  options: BetOption[];
  activeOptionId: string;
  onOptionSelect: (option: BetOption) => void;
}) {
  const noGoalOption = options.find(
    (option) =>
      option.selection.includes("無入球") ||
      option.selection.includes("No Goal") ||
      option.selection.includes("不入球")
  );
  const columns = [
    {
      key: "home",
      label: match?.home_team ? `${match.home_team} (主隊)` : "主",
      option: options.find((option) => optionSide(option, match) === "home"),
    },
    {
      key: "none",
      label: "無入球",
      option: noGoalOption,
    },
    {
      key: "away",
      label: match?.away_team ? `${match.away_team} (客隊)` : "客",
      option: options.find((option) => optionSide(option, match) === "away"),
    },
  ];
  const usedIds = new Set(columns.map((column) => column.option?.id).filter(Boolean));
  const others = options.filter((option) => !usedIds.has(option.id));

  return (
    <div className="bg-slate-900">
      <div className="grid grid-cols-3 text-center text-xs text-slate-300">
        {columns.map((column) => (
          <div key={column.key} className="px-2 py-3">
            <p className="truncate">{column.label}</p>
            {column.option && (
              <MarketOptionButton
                title={title}
                option={column.option}
                active={activeOptionId === column.option.id}
                onSelect={onOptionSelect}
                compact
              />
            )}
          </div>
        ))}
      </div>
      {others.length > 0 && (
        <div className="grid grid-cols-3 border-t border-slate-800">
          {others.map((option) => (
            <MarketOptionButton
              key={option.id}
              title={title}
              option={option}
              active={activeOptionId === option.id}
              onSelect={onOptionSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TwoWayLineGrid({
  title,
  type,
  match,
  options,
  activeOptionId,
  onOptionSelect,
}: {
  title: string;
  type: Exclude<BetType, "過關">;
  match?: Match;
  options: BetOption[];
  activeOptionId: string;
  onOptionSelect: (option: BetOption) => void;
}) {
  const isHiLo = type === "入球大細" || title.includes("角球");
  const leftLabel = isHiLo ? "大" : match?.home_team ? `${match.home_team} (主隊勝)` : "主";
  const rightLabel = isHiLo ? "細" : match?.away_team ? `${match.away_team} (客隊勝)` : "客";
  const lines = Array.from(
    new Set(options.map((option) => lineValueFromLabel(option.selection, title)))
  ).filter(Boolean);
  const rows = (lines.length > 0 ? lines : [""])
    .map((line) => {
      const rowOptions = line
        ? options.filter(
            (option) => lineValueFromLabel(option.selection, title) === line
          )
        : options;

      return {
        line,
        left: rowOptions.find((option) =>
          isHiLo
            ? option.selection.includes("大")
            : optionSide(option, match) === "home"
        ),
        right: rowOptions.find((option) =>
          isHiLo
            ? option.selection.includes("細")
            : optionSide(option, match) === "away"
        ),
      };
    })
    .filter((row) => row.left || row.right);

  return (
    <div className="bg-slate-900">
      <div className="grid grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)] bg-slate-950 text-center text-xs text-slate-300 sm:grid-cols-[1fr_1fr_1fr]">
        <div className="px-2 py-3">{isHiLo ? "球數" : "讓球數"}</div>
        <div className="px-2 py-3">{leftLabel}</div>
        <div className="px-2 py-3">{rightLabel}</div>
      </div>
      {rows.map((row, index) => (
        <div
          key={`${row.line}-${index}`}
          className={cn(
            "grid grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)] items-stretch text-center sm:grid-cols-[1fr_1fr_1fr]",
            index % 2 === 0 ? "bg-slate-800/60" : "bg-slate-900"
          )}
        >
          <div className="flex items-center justify-center px-2 py-3 text-sm font-semibold text-slate-200">
            {row.line || "--"}
          </div>
          <div className="flex items-center justify-center px-1 py-2">
            {row.left && (
              <MarketOptionButton
                title={title}
                option={row.left}
                active={activeOptionId === row.left.id}
                onSelect={onOptionSelect}
                compact
              />
            )}
          </div>
          <div className="flex items-center justify-center px-1 py-2">
            {row.right && (
              <MarketOptionButton
                title={title}
                option={row.right}
                active={activeOptionId === row.right.id}
                onSelect={onOptionSelect}
                compact
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function HandicapGrid({
  title,
  match,
  options,
  activeOptionId,
  onOptionSelect,
}: {
  title: string;
  match?: Match;
  options: BetOption[];
  activeOptionId: string;
  onOptionSelect: (option: BetOption) => void;
}) {
  const homeOptions = options
    .filter((option) => optionSide(option, match) === "home")
    .sort((a, b) =>
      lineValueFromLabel(a.selection, title).localeCompare(
        lineValueFromLabel(b.selection, title)
      )
    );
  const awayOptions = options
    .filter((option) => optionSide(option, match) === "away")
    .sort((a, b) =>
      lineValueFromLabel(a.selection, title).localeCompare(
        lineValueFromLabel(b.selection, title)
      )
    );
  const maxRows = Math.max(homeOptions.length, awayOptions.length);

  return (
    <div className="bg-slate-900">
      <div className="grid grid-cols-2 bg-slate-950 text-center text-xs text-slate-300">
        <div className="px-2 py-3">
          {match?.home_team ? `${match.home_team} (主隊勝)` : "主"}
        </div>
        <div className="px-2 py-3">
          {match?.away_team ? `${match.away_team} (客隊勝)` : "客"}
        </div>
      </div>
      {Array.from({ length: maxRows }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "grid grid-cols-2 text-center",
            index % 2 === 0 ? "bg-slate-800/60" : "bg-slate-900"
          )}
        >
          <HandicapOptionCell
            title={title}
            option={homeOptions[index]}
            activeOptionId={activeOptionId}
            onOptionSelect={onOptionSelect}
          />
          <HandicapOptionCell
            title={title}
            option={awayOptions[index]}
            activeOptionId={activeOptionId}
            onOptionSelect={onOptionSelect}
          />
        </div>
      ))}
    </div>
  );
}

function HandicapOptionCell({
  title,
  option,
  activeOptionId,
  onOptionSelect,
}: {
  title: string;
  option?: BetOption;
  activeOptionId: string;
  onOptionSelect: (option: BetOption) => void;
}) {
  if (!option) return <div className="min-h-[72px]" />;

  return (
    <button
      type="button"
      onClick={() => onOptionSelect(option)}
      className="flex min-h-[72px] flex-col items-center justify-center gap-1 px-2 py-2"
    >
      <span className="text-sm font-semibold text-slate-200">
        {lineValueFromLabel(option.selection, title) || "--"}
      </span>
      <span className="inline-flex items-center justify-center gap-2">
        <span
          className={cn(
            "h-7 w-7 shrink-0 rounded border bg-slate-950",
            activeOptionId === option.id
              ? "border-emerald-500 bg-emerald-500"
              : "border-slate-400"
          )}
          aria-hidden="true"
        />
        <span className="text-base font-bold leading-none text-slate-100">
          {option.odds.toFixed(2)}
        </span>
      </span>
    </button>
  );
}

function MarketOptionButton({
  title,
  option,
  active,
  onSelect,
  compact,
}: {
  title: string;
  option: BetOption;
  active: boolean;
  onSelect: (option: BetOption) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option)}
      className="inline-flex min-h-9 w-full items-center justify-center gap-1 px-1 py-1 text-center sm:gap-2"
    >
      <span
        className={cn(
          "h-6 w-6 shrink-0 rounded border bg-slate-950 sm:h-7 sm:w-7",
          active ? "border-emerald-500 bg-emerald-500" : "border-slate-400"
        )}
        aria-hidden="true"
      />
      <span className="min-w-0">
        {!compact && (
          <span className="block truncate text-xs text-slate-300">
            {displaySelectionLabel(option.selection, title) || option.selection}
          </span>
        )}
        <span className="block text-sm font-bold leading-none text-slate-100 sm:text-base">
          {option.odds.toFixed(2)}
        </span>
      </span>
    </button>
  );
}

function ScoreOptionButton({
  title,
  option,
  active,
  onSelect,
}: {
  title: string;
  option: BetOption;
  active: boolean;
  onSelect: (option: BetOption) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option)}
      className={cn(
        "flex min-h-[62px] w-full items-center justify-center gap-1 border-b border-slate-800 px-1 py-2 text-center transition-colors",
        active ? "bg-emerald-500/15" : "bg-transparent"
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-xs text-slate-300">
          {displaySelectionLabel(option.selection, title) || option.selection}
        </span>
        <span className="mt-1 block text-base font-bold leading-none text-slate-100">
          {option.odds.toFixed(2)}
        </span>
      </span>
      <span
        className={cn(
          "h-5 w-5 shrink-0 rounded border bg-slate-950",
          active ? "border-emerald-500 bg-emerald-500" : "border-slate-400"
        )}
        aria-hidden="true"
      />
    </button>
  );
}

function ParlayBuilder({
  matches,
  allMatchesCount,
  showAllMatches,
  setShowAllMatches,
  legs,
  availableBetTypes,
  currentOptions,
  loadingMatchIds,
  loadingMarketKeys,
  onMatchChange,
  onLegChange,
  onOptionSelect,
  onAddLeg,
  onRemoveLeg,
}: {
  matches: Match[];
  allMatchesCount: number;
  showAllMatches: boolean;
  setShowAllMatches: (value: boolean | ((current: boolean) => boolean)) => void;
  legs: EditableLeg[];
  availableBetTypes: Exclude<BetType, "過關">[];
  currentOptions: Record<string, BetOption[]>;
  loadingMatchIds: string[];
  loadingMarketKeys: string[];
  onMatchChange: (key: number, value: string) => void;
  onLegChange: (
    key: number,
    field: keyof Omit<EditableLeg, "key">,
    value: string
  ) => void;
  onOptionSelect: (key: number, value: string) => void;
  onAddLeg: () => void;
  onRemoveLeg: (key: number) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-3">
        <p className="text-sm font-bold text-white">過關投注</p>
        <p className="mt-1 text-xs text-slate-500">
          最少 2 關、最多 10 關，同一場賽事不可重複。
        </p>
      </div>

      {legs.map((leg, index) => {
        const selectedByOthers = new Set(
          legs.filter((item) => item.key !== leg.key).map((item) => item.match_id)
        );
        const options =
          leg.match_id && leg.bet_type
            ? (currentOptions[leg.match_id] ?? []).filter(
                (option) => option.bet_type === leg.bet_type
              )
            : [];
        const loading =
          Boolean(leg.match_id && loadingMatchIds.includes(leg.match_id)) ||
          Boolean(
            leg.match_id &&
              leg.bet_type &&
              loadingMarketKeys.includes(`${leg.match_id}:${leg.bet_type}`)
          );

        return (
          <div
            key={leg.key}
            className="rounded-lg border border-slate-800 bg-slate-950"
          >
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2">
              <h3 className="text-sm font-bold text-white">第 {index + 1} 關</h3>
              {legs.length > 2 && (
                <button
                  type="button"
                  onClick={() => onRemoveLeg(leg.key)}
                  className="text-xs font-semibold text-red-400"
                >
                  移除
                </button>
              )}
            </div>
            <div className="space-y-3 p-3">
              <select
                required
                value={leg.match_id}
                onChange={(event) => onMatchChange(leg.key, event.target.value)}
                className="form-input appearance-none"
              >
                <option value="">選擇賽事</option>
                {matches.map((match) => (
                  <option
                    key={match.id}
                    value={match.id}
                    disabled={selectedByOthers.has(match.id)}
                  >
                    {match.home_team} vs {match.away_team} ·{" "}
                    {formatHKTime(match.kickoff_time, "MM/dd HH:mm")}
                  </option>
                ))}
              </select>

              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  required
                  value={leg.bet_type}
                  onChange={(event) => {
                    onLegChange(leg.key, "bet_type", event.target.value);
                    onLegChange(leg.key, "option_id", "");
                    onLegChange(leg.key, "selection", "");
                    onLegChange(leg.key, "odds", "");
                  }}
                  className="form-input appearance-none"
                >
                  <option value="">投注種類</option>
                  {availableBetTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  required
                  min="1.01"
                  step="0.01"
                  value={leg.odds}
                  onChange={(event) =>
                    onLegChange(leg.key, "odds", event.target.value)
                  }
                  className="form-input"
                  placeholder="賠率"
                />
              </div>

              {loading ? (
                <div className="rounded border border-slate-800 bg-slate-900 px-3 py-3 text-sm text-slate-400">
                  正在載入 HKJC 賠率...
                </div>
              ) : options.length > 0 ? (
                <select
                  value={leg.option_id}
                  onChange={(event) => onOptionSelect(leg.key, event.target.value)}
                  className="form-input appearance-none"
                >
                  <option value="">自訂輸入</option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.selection} · 賠率 {option.odds.toFixed(2)}
                    </option>
                  ))}
                </select>
              ) : null}

              <input
                type="text"
                required
                maxLength={100}
                value={leg.selection}
                onChange={(event) =>
                  onLegChange(leg.key, "selection", event.target.value)
                }
                className="form-input"
                placeholder="投注選項，例如：主勝、香港 +0.25"
              />
            </div>
          </div>
        );
      })}

      <div className="grid gap-2 sm:grid-cols-2">
        {legs.length < 10 && (
          <button
            type="button"
            onClick={onAddLeg}
            className="btn-secondary py-2.5 text-sm"
          >
            加多一關
          </button>
        )}
        {allMatchesCount > 6 && (
          <button
            type="button"
            onClick={() => setShowAllMatches((current) => !current)}
            className="btn-secondary py-2.5 text-sm"
          >
            {showAllMatches
              ? "只顯示最近 6 場"
              : `顯示更多賽事（${allMatchesCount - 6}）`}
          </button>
        )}
      </div>
    </section>
  );
}

function Betslip({
  mode,
  selectedMatch,
  selection,
  betType,
  odds,
  legs,
  stake,
  setStake,
  currentBalance,
  possibleReturn,
  pending,
  disabled,
}: {
  mode: Mode;
  selectedMatch?: Match;
  selection?: string;
  betType?: Exclude<BetType, "過關"> | "";
  odds: number;
  legs?: EditableLeg[];
  stake: string;
  setStake: (value: string) => void;
  currentBalance: number;
  possibleReturn: number;
  pending: boolean;
  disabled: boolean;
}) {
  const stakeNum = Number(stake) || 0;

  return (
    <aside className="hidden rounded-lg border border-slate-800 bg-slate-950 lg:sticky lg:top-4 lg:block lg:self-start">
      <div className="border-b border-slate-800 bg-emerald-600 px-3 py-2">
        <h3 className="text-sm font-bold text-white">投注單</h3>
      </div>
      <div className="space-y-4 p-3">
        {mode === "single" ? (
          <div className="rounded border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {selectedMatch
                    ? `${selectedMatch.home_team} 對 ${selectedMatch.away_team}`
                    : "未選擇賽事"}
                </p>
                <p className="mt-1 text-xs text-slate-500">{betType || "玩法"}</p>
              </div>
              <p className="shrink-0 text-lg font-bold text-emerald-300">
                {odds > 1 ? odds.toFixed(2) : "--"}
              </p>
            </div>
            <p className="mt-3 min-h-5 text-sm font-semibold text-slate-200">
              {selection || "請在左方選擇賠率或自訂投注"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {(legs ?? []).map((leg, index) => (
              <div
                key={leg.key}
                className="rounded border border-slate-800 bg-slate-900 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-500">
                    第 {index + 1} 關 · {leg.bet_type || "玩法"}
                  </p>
                  <p className="font-bold text-emerald-300">
                    {Number(leg.odds) > 1 ? Number(leg.odds).toFixed(2) : "--"}
                  </p>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-200">
                  {leg.selection || "未選擇"}
                </p>
              </div>
            ))}
          </div>
        )}

        <StakeInput
          stake={stake}
          setStake={setStake}
          currentBalance={currentBalance}
        />

        <ReturnPreview
          possibleReturn={possibleReturn}
          stake={stakeNum}
          odds={odds}
        />

        <SubmitButton
          pending={pending}
          disabled={disabled}
          label={mode === "parlay" ? `確認 ${legs?.length ?? 0} 關過關` : "確認落注"}
        />
      </div>
    </aside>
  );
}

function MobileBetslipBar({
  mode,
  selectedMatch,
  selection,
  betType,
  odds,
  oddsString,
  legs,
  stake,
  setStake,
  currentBalance,
  possibleReturn,
  pending,
  disabled,
  onSelectionChange,
  onOddsChange,
  selectedMarketKey,
  onMarketChange,
  allMarketGroups,
  optionGroups,
  selectedOptionId,
  onOptionChange,
}: {
  mode: Mode;
  selectedMatch?: Match;
  selection?: string;
  betType?: Exclude<BetType, "過關"> | "";
  odds: number;
  oddsString?: string;
  legs?: EditableLeg[];
  stake: string;
  setStake: (value: string) => void;
  currentBalance: number;
  possibleReturn: number;
  pending: boolean;
  disabled: boolean;
  onSelectionChange?: (value: string) => void;
  onOddsChange?: (value: string) => void;
  selectedMarketKey?: string;
  onMarketChange?: (key: string) => void;
  allMarketGroups?: MarketGroup[];
  optionGroups?: MarketGroup[];
  selectedOptionId?: string;
  onOptionChange?: (id: string) => void;
}) {
  const summary =
    mode === "single"
      ? selectedMatch
        ? `${selectedMatch.home_team} 對 ${selectedMatch.away_team}`
        : "未選擇賽事"
      : `${legs?.filter((leg) => leg.selection).length ?? 0}/${legs?.length ?? 0} 關已選`;

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 border-t border-slate-800 bg-slate-950/95 px-3 py-2 shadow-2xl backdrop-blur lg:hidden">
      <div className="mx-auto max-w-lg space-y-2">
        {mode === "single" && onMarketChange && selectedMarketKey !== undefined && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {QUICK_MARKET_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onMarketChange(tab.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  selectedMarketKey === tab.key
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-800 text-slate-300 active:bg-slate-700"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        {mode === "single" && onMarketChange && allMarketGroups && selectedMarketKey !== undefined && (
          <select
            value={selectedMarketKey}
            onChange={(event) => onMarketChange(event.target.value)}
            className="w-full appearance-none rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="全部" className="bg-slate-900 text-white">全部</option>
            {allMarketGroups.map((group) => (
              <option key={group.key} value={group.key} className="bg-slate-900 text-white">
                {group.title}
              </option>
            ))}
          </select>
        )}
        {mode === "single" && onOptionChange && optionGroups && (
          <select
            value={selectedOptionId ?? ""}
            onChange={(event) => onOptionChange(event.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="" className="bg-slate-900 text-white">自訂輸入</option>
            {optionGroups.flatMap((group) =>
              group.options.map((option) => (
                <option key={option.id} value={option.id} className="bg-slate-900 text-white">
                  {group.title} · {displaySelectionLabel(option.selection, group.title) || option.selection} · 賠率 {option.odds.toFixed(2)}
                </option>
              ))
            )}
          </select>
        )}
        {mode === "single" && onSelectionChange && onOddsChange && (
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <input
              type="text"
              maxLength={100}
              value={selection ?? ""}
              onChange={(event) => onSelectionChange(event.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="自訂投注選項"
            />
            <input
              type="number"
              min="1.01"
              step="0.01"
              value={oddsString ?? ""}
              onChange={(event) => onOddsChange(event.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-2 text-right text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="賠率"
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-200">
              {summary}
            </p>
            <p className="text-xs text-slate-500">
              {mode === "single" && betType && `${betType} · `}
              賠率 {odds > 1 ? odds.toFixed(2) : "--"}
              {possibleReturn > 0 && ` · 派彩 ${formatCurrency(possibleReturn)}`}
            </p>
          </div>
          <input
            name="stake"
            type="number"
            required
            min="1"
            step="1"
            max={currentBalance}
            value={stake}
            onChange={(event) => setStake(event.target.value)}
            className="h-10 w-24 rounded border border-slate-700 bg-slate-900 px-2 text-right text-sm font-bold text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            placeholder="金額"
          />
        </div>
        <button
          type="submit"
          disabled={pending || disabled}
          className={cn(
            "h-11 w-full rounded-full text-sm font-bold transition-colors",
            pending || disabled
              ? "bg-slate-200 text-slate-400"
              : "bg-emerald-500 text-white active:bg-emerald-600"
          )}
        >
          {pending
            ? "提交中"
            : mode === "parlay"
            ? "加入到投注區"
            : "確認落注"}
        </button>
      </div>
    </div>
  );
}

function StakeInput({
  stake,
  setStake,
  currentBalance,
}: {
  stake: string;
  setStake: (value: string) => void;
  currentBalance: number;
}) {
  const stakeNum = Number(stake) || 0;
  const quickStakes = [10, 20, 50, 100];

  return (
    <div>
      <label className="form-label">投注額 (HK$)</label>
      <input
        name="stake"
        type="number"
        required
        min="1"
        step="1"
        max={currentBalance}
        value={stake}
        onChange={(event) => setStake(event.target.value)}
        className="form-input"
      />
      <div className="mt-2 grid grid-cols-4 gap-2">
        {quickStakes.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setStake(String(Math.min(amount, currentBalance)))}
            className={cn(
              "rounded border py-1.5 text-xs font-semibold transition-colors",
              stakeNum === amount
                ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                : "border-slate-700 text-slate-400 hover:border-slate-500"
            )}
          >
            ${amount}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReturnPreview({
  possibleReturn,
  stake,
  odds,
}: {
  possibleReturn: number;
  stake: number;
  odds: number;
}) {
  if (possibleReturn <= 0 || odds <= 1) return null;

  return (
    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
      <div className="flex justify-between text-sm">
        <span className="text-slate-400">總賠率</span>
        <span className="font-semibold text-white">{odds.toFixed(4)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm text-slate-400">預計派彩</span>
        <span className="text-xl font-bold text-emerald-300">
          {formatCurrency(possibleReturn)}
        </span>
      </div>
      <p className="mt-1 text-right text-xs text-emerald-400">
        淨盈利 +{formatCurrency(possibleReturn - stake)}
      </p>
    </div>
  );
}

function SubmitButton({
  pending,
  disabled,
  label = "確認落注",
}: {
  pending: boolean;
  disabled: boolean;
  label?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="btn-primary w-full py-4 text-base disabled:cursor-not-allowed"
    >
      {pending ? "提交中" : label}
    </button>
  );
}
