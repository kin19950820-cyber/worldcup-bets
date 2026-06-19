"use client";

import { formatCurrency, formatProfitLoss, cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/lib/types";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="card p-12 text-center text-slate-500">
        <div className="text-5xl mb-4">🏆</div>
        <p>暫無排名資料</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Desktop table header */}
      <div className="hidden md:grid grid-cols-7 text-xs text-slate-500 uppercase tracking-wide px-4 py-2">
        <span>排名</span>
        <span className="col-span-2">名字</span>
        <span className="text-right">現時資金</span>
        <span className="text-right">盈虧</span>
        <span className="text-right">勝率</span>
        <span className="text-right">已投注</span>
      </div>

      {entries.map((e, i) => (
        <div
          key={e.id}
          className={cn(
            "card p-4 transition-colors",
            i === 0 && "border-yellow-500/40 bg-yellow-500/5",
            i === 1 && "border-slate-400/40 bg-slate-400/5",
            i === 2 && "border-amber-600/40 bg-amber-600/5"
          )}
        >
          {/* Mobile layout */}
          <div className="flex items-center gap-3 md:hidden">
            <span className="text-2xl w-8 text-center">
              {MEDALS[i] ?? `#${i + 1}`}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{e.display_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-400">
                  {e.total_won}勝 {e.total_lost}負 {e.total_pending > 0 ? `${e.total_pending}待` : ""}
                </span>
                <span className="text-xs text-slate-600">·</span>
                <span className="text-xs text-slate-400">
                  勝率 {(e.win_rate * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-white">{formatCurrency(e.net_balance)}</p>
              <p className={cn("text-xs font-semibold", e.profit_loss >= 0 ? "profit-positive" : "profit-negative")}>
                {formatProfitLoss(e.profit_loss)}
              </p>
              {e.total_borrowed > 0 && (
                <p className="text-xs text-orange-400 mt-0.5">
                  現金 {formatCurrency(e.current_balance)} · 借款 {formatCurrency(e.total_borrowed)}
                </p>
              )}
              {e.pending_stake > 0 && (
                <p className="text-xs text-yellow-400 mt-0.5">
                  待結算 {formatCurrency(e.pending_stake)}
                </p>
              )}
            </div>
          </div>

          {/* Desktop layout */}
          <div className="hidden md:grid grid-cols-7 items-center">
            <span className="text-xl">{MEDALS[i] ?? `#${i + 1}`}</span>
            <span className="col-span-2 font-semibold text-white">{e.display_name}</span>
            <span className="text-right">
              <span className="block font-bold text-white">{formatCurrency(e.net_balance)}</span>
              {e.total_borrowed > 0 && (
                <span className="block text-xs text-orange-400">
                  借 {formatCurrency(e.total_borrowed)}
                </span>
              )}
              {e.pending_stake > 0 && (
                <span className="block text-xs text-yellow-400">
                  待結算 {formatCurrency(e.pending_stake)}
                </span>
              )}
            </span>
            <span className={cn("text-right font-semibold text-sm", e.profit_loss >= 0 ? "profit-positive" : "profit-negative")}>
              {formatProfitLoss(e.profit_loss)}
            </span>
            <span className="text-right text-slate-300 text-sm">
              {(e.win_rate * 100).toFixed(0)}%
              <span className="text-slate-500 text-xs ml-1">({e.total_won}/{e.total_won + e.total_lost})</span>
            </span>
            <span className="text-right text-slate-400 text-sm">{formatCurrency(e.total_stake)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
