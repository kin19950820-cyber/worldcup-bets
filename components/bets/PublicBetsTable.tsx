"use client";

import { useEffect, useState } from "react";
import {
  formatCurrency,
  formatHKTime,
  getSettlementStatus,
  getStatusLabel,
  cn,
} from "@/lib/utils";
import { BET_TYPES } from "@/lib/types";
import { parseParlay } from "@/lib/parlay";

type BetRow = {
  id: string;
  bet_type: string;
  selection: string;
  odds: number;
  stake: number;
  possible_return: number;
  payout: number;
  status: string;
  created_at: string;
  profiles: { display_name: string } | null;
  matches: {
    home_team: string;
    away_team: string;
    kickoff_time: string;
    stage: string | null;
  } | null;
};

interface Props {
  initialBets: BetRow[];
  matches: { id: string; home_team: string; away_team: string }[];
  players: { id: string; display_name: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  won: "bg-emerald-500/20 text-emerald-400",
  half_won: "bg-lime-500/20 text-lime-400",
  lost: "bg-red-500/20 text-red-400",
  half_lost: "bg-orange-500/20 text-orange-400",
  void: "bg-slate-500/20 text-slate-400",
};

const BETS_PER_PAGE = 20;

// Outright markets (冠軍 / 神射手) live on virtual "特別項目" matches and only
// settle at season end, so they're hidden from the board by default.
const OUTRIGHT_STAGE = "特別項目";
const isOutrightBet = (b: BetRow) => b.matches?.stage === OUTRIGHT_STAGE;

type SortKey =
  | "newest"
  | "oldest"
  | "payout"
  | "possible"
  | "stake"
  | "odds"
  | "actual";

const num = (value: number) => Number(value) || 0;

// Effective odds actually achieved = payout / stake (matches nominal odds on a
// full win, lower for 贏半/走盤, 0 for a loss).
const actualOdds = (bet: { payout: number; stake: number }) =>
  num(bet.stake) > 0 ? num(bet.payout) / num(bet.stake) : 0;

export default function PublicBetsTable({ initialBets, matches, players }: Props) {
  const [filterMatch, setFilterMatch] = useState("all");
  const [filterPlayer, setFilterPlayer] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [showOutrights, setShowOutrights] = useState(false);
  const [page, setPage] = useState(1);

  const outrightCount = initialBets.filter(isOutrightBet).length;

  const filtered = initialBets.filter((b) => {
    // Season-end outrights (冠軍等) are hidden unless explicitly shown.
    if (!showOutrights && isOutrightBet(b)) return false;

    const parlay = parseParlay(b.selection);
    const displayStatus = parlay
      ? b.status
      : getSettlementStatus(b.status, b.payout, b.stake, b.odds);

    if (filterMatch !== "all") {
      const match = matches.find((m) => `${m.home_team} vs ${m.away_team}` === filterMatch);
      const containsMatch = parlay
        ? parlay.legs.some((leg) => leg.match_id === match?.id)
        : b.matches?.home_team === match?.home_team;
      if (match && !containsMatch) return false;
    }
    if (filterPlayer !== "all" && b.profiles?.display_name !== filterPlayer) return false;
    if (filterStatus !== "all" && displayStatus !== filterStatus) return false;
    if (filterType !== "all" && b.bet_type !== filterType) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "payout":
        return num(b.payout) - num(a.payout);
      case "possible":
        return num(b.possible_return) - num(a.possible_return);
      case "stake":
        return num(b.stake) - num(a.stake);
      case "odds":
        return num(b.odds) - num(a.odds);
      case "actual":
        return actualOdds(b) - actualOdds(a);
      case "oldest":
        return (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      case "newest":
      default:
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / BETS_PER_PAGE));
  const pageStart = (page - 1) * BETS_PER_PAGE;
  const visibleBets = sorted.slice(pageStart, pageStart + BETS_PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [filterMatch, filterPlayer, filterStatus, filterType, sortBy, showOutrights]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="form-input text-sm py-2"
        >
          <option value="all">全部狀態</option>
          <option value="pending">待結算</option>
          <option value="won">贏</option>
          <option value="half_won">贏半</option>
          <option value="lost">輸</option>
          <option value="half_lost">輸半</option>
          <option value="void">走盤</option>
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="form-input text-sm py-2"
        >
          <option value="all">全部種類</option>
          {BET_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={filterPlayer}
          onChange={(e) => setFilterPlayer(e.target.value)}
          className="form-input text-sm py-2"
        >
          <option value="all">全部玩家</option>
          {players.map((p) => (
            <option key={p.id} value={p.display_name}>{p.display_name}</option>
          ))}
        </select>

        <button
          onClick={() => {
            setFilterMatch("all");
            setFilterPlayer("all");
            setFilterStatus("all");
            setFilterType("all");
          }}
          className="btn-secondary text-sm py-2"
        >
          重設篩選
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="shrink-0 text-xs text-slate-500">排序</label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="form-input text-sm py-2 sm:max-w-xs"
        >
          <option value="newest">最新優先</option>
          <option value="oldest">最舊優先</option>
          <option value="payout">派彩最多（實得）</option>
          <option value="possible">可贏最多</option>
          <option value="stake">投注最多</option>
          <option value="odds">賠率最高</option>
          <option value="actual">實際賠率最高</option>
        </select>

        {outrightCount > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={showOutrights}
              onChange={(e) => setShowOutrights(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-500"
            />
            顯示冠軍等季尾賽果（{outrightCount}）
          </label>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <p>
          共 {filtered.length} 筆記錄
          {filtered.length > 0 &&
            ` · 顯示 ${pageStart + 1}-${Math.min(
              pageStart + visibleBets.length,
              filtered.length
            )}`}
        </p>
        {totalPages > 1 && (
          <p>
            第 {page} / {totalPages} 頁
          </p>
        )}
      </div>

      {/* Cards (mobile) / Table rows (desktop) */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <div className="text-4xl mb-3">🔍</div>
          <p>沒有符合條件的投注記錄</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleBets.map((bet) => {
            const parlay = parseParlay(bet.selection);
            const displayStatus = parlay
              ? bet.status
              : getSettlementStatus(
                  bet.status,
                  bet.payout,
                  bet.stake,
                  bet.odds
                );

            return (
            <div key={bet.id} className="card p-4">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm">
                      {bet.profiles?.display_name ?? "—"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {parlay ? `${parlay.legs.length} 關過關` : bet.bet_type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {parlay
                      ? `總賠率 ${bet.odds}`
                      : bet.matches
                      ? `${bet.matches.home_team} vs ${bet.matches.away_team}`
                      : "—"}
                    {!parlay && bet.matches?.kickoff_time &&
                      ` · ${formatHKTime(bet.matches.kickoff_time, "MM/dd HH:mm")}`}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
                    STATUS_COLORS[displayStatus] ?? STATUS_COLORS.pending
                  )}
                >
                  {getStatusLabel(displayStatus)}
                </span>
              </div>

              {/* Selection + odds */}
              {parlay ? (
                <div className="space-y-2 mb-3">
                  {parlay.legs.map((leg, index) => (
                    <div
                      key={leg.id}
                      className="bg-slate-800/50 rounded-lg p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white font-medium">
                          {index + 1}. {leg.home_team} vs {leg.away_team}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5",
                            STATUS_COLORS[leg.status] ?? STATUS_COLORS.pending
                          )}
                        >
                          {getStatusLabel(leg.status)}
                        </span>
                      </div>
                      <p className="text-slate-400 mt-1">
                        {leg.bet_type} · {leg.selection} @ {leg.odds}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-800/50 rounded-lg p-2.5 mb-2">
                  <span className="text-white text-sm font-medium">
                    {bet.selection}
                  </span>
                  <span className="text-slate-400 text-xs ml-2">
                    @ {bet.odds}
                  </span>
                </div>
              )}

              {/* Financials */}
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-slate-500">投注 </span>
                  <span className="text-white font-medium">{formatCurrency(bet.stake)}</span>
                </div>
                <div>
                  <span className="text-slate-500">可贏 </span>
                  <span className="text-brand-400 font-medium">
                    {formatCurrency(bet.possible_return)}
                  </span>
                </div>
                {["won", "half_won", "half_lost", "void"].includes(displayStatus) && (
                  <>
                    <div>
                      <span className="text-slate-500">實得 </span>
                      <span className="text-emerald-400 font-medium">
                        {formatCurrency(bet.payout)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">實際賠率 </span>
                      <span className="text-white font-medium">
                        {actualOdds(bet).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
                <div className="ml-auto text-slate-600">
                  {formatHKTime(bet.created_at, "MM/dd HH:mm")}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="btn-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            上一頁
          </button>
          <span className="text-xs text-slate-500">
            每頁 {BETS_PER_PAGE} 筆
          </span>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            disabled={page === totalPages}
            className="btn-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一頁
          </button>
        </div>
      )}
    </div>
  );
}
