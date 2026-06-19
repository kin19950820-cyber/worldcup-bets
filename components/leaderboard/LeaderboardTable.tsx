"use client";

import { formatCurrency, formatProfitLoss, cn } from "@/lib/utils";
import type { BetStatus, LeaderboardEntry } from "@/lib/types";

const MEDALS = ["🥇", "🥈", "🥉"];
const TOP_TITLES = ["神算子", "大軍師", "金靴軍師"];
const BOTTOM_TITLES = ["天台觀察員", "反向明燈", "還錢大使"];

const RESULT_META: Record<
  Exclude<BetStatus, "pending">,
  { icon: string; label: string; className: string }
> = {
  won: {
    icon: "✓",
    label: "贏",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  half_won: {
    icon: "½✓",
    label: "贏半",
    className: "bg-lime-500/15 text-lime-300 border-lime-500/30",
  },
  lost: {
    icon: "×",
    label: "輸",
    className: "bg-red-500/15 text-red-300 border-red-500/30",
  },
  half_lost: {
    icon: "½×",
    label: "輸半",
    className: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  },
  void: {
    icon: "–",
    label: "走盤",
    className: "bg-slate-700/60 text-slate-300 border-slate-600/70",
  },
};

function getRankTitle(index: number, total: number) {
  if (index < TOP_TITLES.length) return TOP_TITLES[index];

  const bottomStart = Math.max(total - BOTTOM_TITLES.length, TOP_TITLES.length);
  if (index >= bottomStart) return BOTTOM_TITLES[index - bottomStart];

  return null;
}

function TrendIcons({ results }: { results: BetStatus[] }) {
  const settledResults = results.filter(
    (result): result is Exclude<BetStatus, "pending"> => result !== "pending"
  );

  if (settledResults.length === 0) {
    return <span className="text-xs text-slate-600">未有往績</span>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {settledResults.map((result, index) => {
        const meta = RESULT_META[result];
        return (
          <span
            key={`${result}-${index}`}
            title={`最近第 ${index + 1} 注：${meta.label}`}
            aria-label={meta.label}
            className={cn(
              "inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[10px] font-bold leading-none",
              meta.className
            )}
          >
            {meta.icon}
          </span>
        );
      })}
    </div>
  );
}

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
      <div className="hidden md:grid grid-cols-8 text-xs text-slate-500 uppercase tracking-wide px-4 py-2">
        <span>排名</span>
        <span className="col-span-2">名字</span>
        <span className="text-right">現時資金</span>
        <span className="text-right">盈虧</span>
        <span className="text-right">勝率</span>
        <span className="text-right">近 10 注</span>
        <span className="text-right">已投注</span>
      </div>

      {entries.map((e, i) => {
        const rankTitle = getRankTitle(i, entries.length);

        return (
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
            <div className="md:hidden">
              <div className="flex items-center gap-3">
                <span className="text-2xl w-8 text-center">
                  {MEDALS[i] ?? `#${i + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white truncate">{e.display_name}</p>
                    {rankTitle && (
                      <span className="shrink-0 rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-200">
                        {rankTitle}
                      </span>
                    )}
                  </div>
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
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
                <span className="text-xs text-slate-500">近 10 注</span>
                <TrendIcons results={e.recent_results} />
              </div>
            </div>

            {/* Desktop layout */}
            <div className="hidden md:grid grid-cols-8 items-center">
              <span className="text-xl">{MEDALS[i] ?? `#${i + 1}`}</span>
              <span className="col-span-2 min-w-0">
                <span className="block truncate font-semibold text-white">{e.display_name}</span>
                {rankTitle && (
                  <span className="mt-1 inline-flex rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-200">
                    {rankTitle}
                  </span>
                )}
              </span>
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
              <span className="text-right">
                <TrendIcons results={e.recent_results} />
              </span>
              <span className="text-right text-slate-400 text-sm">{formatCurrency(e.total_stake)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
