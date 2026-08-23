"use client";

import { useState } from "react";
import type { LeaderboardEntry } from "@/lib/types";
import { formatCurrency, cn } from "@/lib/utils";

// Secondary ranking by betting efficiency: ROI = 盈虧 ÷ 已投注. Only players who
// have actually staked something are ranked. Collapsed by default.
export default function RoiRanking({ entries }: { entries: LeaderboardEntry[] }) {
  const [open, setOpen] = useState(false);

  const ranked = entries
    .filter((e) => e.total_stake > 0)
    .sort((a, b) => b.roi - a.roi);

  if (ranked.length === 0) return null;

  return (
    <div className="card p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <h2 className="font-semibold text-white">💹 效率榜（ROI）</h2>
        <span className="text-xs text-slate-500">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 px-2 font-medium">玩家</th>
                <th className="py-1.5 px-2 text-right font-medium">ROI</th>
                <th className="py-1.5 px-2 text-right font-medium">盈虧</th>
                <th className="py-1.5 pl-2 text-right font-medium">已投注</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((e, i) => (
                <tr key={e.id} className="border-t border-slate-800">
                  <td className="py-2 pr-2 text-slate-400">
                    {["🥇", "🥈", "🥉"][i] ?? i + 1}
                  </td>
                  <td className="py-2 px-2 font-medium text-white">
                    {e.display_name}
                  </td>
                  <td
                    className={cn(
                      "py-2 px-2 text-right font-semibold",
                      e.roi >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {(e.roi * 100).toFixed(1)}%
                  </td>
                  <td
                    className={cn(
                      "py-2 px-2 text-right",
                      e.profit_loss >= 0 ? "text-emerald-300" : "text-red-300"
                    )}
                  >
                    {e.profit_loss >= 0 ? "+" : ""}
                    {formatCurrency(e.profit_loss)}
                  </td>
                  <td className="py-2 pl-2 text-right text-slate-400">
                    {formatCurrency(e.total_stake)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-600">
            ROI = 盈虧 ÷ 已投注。只計有落注的玩家，衡量投注效率而非身家大細。
          </p>
        </div>
      )}
    </div>
  );
}
