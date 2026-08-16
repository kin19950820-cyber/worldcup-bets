"use client";

import type { LeaderboardEntry } from "@/lib/types";
import { formatCurrency, formatProfitLoss, cn } from "@/lib/utils";

// Compact per-group summary: each member's current cash, rebuys (loans) and
// net worth, plus group totals. Shown when a specific group is selected.
export default function GroupOverview({
  groupName,
  members,
}: {
  groupName: string;
  members: LeaderboardEntry[];
}) {
  const rows = [...members].sort((a, b) => b.net_balance - a.net_balance);
  const totalCash = rows.reduce((s, m) => s + m.current_balance, 0);
  const totalRebuys = rows.reduce((s, m) => s + m.loan_count, 0);
  const totalDebt = rows.reduce((s, m) => s + m.total_borrowed, 0);

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-white">📊 {groupName} · 群組總覽</h2>
        <span className="text-xs text-slate-500">{rows.length} 位成員</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="py-1.5 pr-2 font-medium">玩家</th>
              <th className="py-1.5 px-2 text-right font-medium">現時餘額</th>
              <th className="py-1.5 px-2 text-center font-medium">重買</th>
              <th className="py-1.5 pl-2 text-right font-medium">淨資產</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-slate-800">
                <td className="py-2 pr-2 font-medium text-white">
                  {m.display_name}
                </td>
                <td className="py-2 px-2 text-right text-slate-200">
                  {formatCurrency(m.current_balance)}
                  {m.total_borrowed > 0 && (
                    <span className="ml-1 text-[11px] text-orange-400">
                      (欠 {formatCurrency(m.total_borrowed)})
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 text-center">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                      m.loan_count > 0
                        ? "bg-orange-500/15 text-orange-300"
                        : "text-slate-500"
                    )}
                  >
                    {m.loan_count} / 2
                  </span>
                </td>
                <td className="py-2 pl-2 text-right">
                  <span className="font-semibold text-white">
                    {formatCurrency(m.net_balance)}
                  </span>
                  <span
                    className={cn(
                      "ml-1 text-[11px]",
                      m.profit_loss >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {formatProfitLoss(m.profit_loss)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700 text-xs text-slate-400">
              <td className="py-2 pr-2 font-semibold">合計</td>
              <td className="py-2 px-2 text-right">{formatCurrency(totalCash)}</td>
              <td className="py-2 px-2 text-center">{totalRebuys} 次</td>
              <td className="py-2 pl-2 text-right">
                {totalDebt > 0 ? `欠 ${formatCurrency(totalDebt)}` : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
