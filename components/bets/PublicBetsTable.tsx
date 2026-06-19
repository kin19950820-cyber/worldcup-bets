"use client";

import { useState } from "react";
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

export default function PublicBetsTable({ initialBets, matches, players }: Props) {
  const [filterMatch, setFilterMatch] = useState("all");
  const [filterPlayer, setFilterPlayer] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const filtered = initialBets.filter((b) => {
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

      <p className="text-slate-500 text-xs">共 {filtered.length} 筆記錄</p>

      {/* Cards (mobile) / Table rows (desktop) */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <div className="text-4xl mb-3">🔍</div>
          <p>沒有符合條件的投注記錄</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((bet) => {
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
                  <div>
                    <span className="text-slate-500">實得 </span>
                    <span className="text-emerald-400 font-medium">
                      {formatCurrency(bet.payout)}
                    </span>
                  </div>
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
    </div>
  );
}
