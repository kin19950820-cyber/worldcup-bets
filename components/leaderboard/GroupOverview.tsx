"use client";

import type { LeaderboardEntry } from "@/lib/types";
import type { MyGroup } from "@/lib/actions/groups";
import { computePrizePool } from "@/lib/prize-pool";
import { formatCurrency, formatProfitLoss, cn } from "@/lib/utils";

// Compact per-group summary: each member's current cash, rebuys (loans) and
// net worth, plus group totals and the real-money prize pool. Shown when a
// specific group is selected.
export default function GroupOverview({
  group,
  members,
}: {
  group: MyGroup;
  members: LeaderboardEntry[];
}) {
  const rows = [...members].sort((a, b) => b.net_balance - a.net_balance);
  const totalCash = rows.reduce((s, m) => s + m.current_balance, 0);
  const totalRebuys = rows.reduce((s, m) => s + m.loan_count, 0);
  const totalDebt = rows.reduce((s, m) => s + m.total_borrowed, 0);

  const pool = computePrizePool(
    {
      buyinAmount: group.buyin_amount,
      rebuyAmount: group.rebuy_amount,
      payoutFirst: group.payout_first,
      payoutSecond: group.payout_second,
      payoutThird: group.payout_third,
    },
    rows.length,
    totalRebuys
  );
  const hasPool = pool.pool > 0;
  // Project the split onto the current top-3 (by net worth).
  const podium = [
    { place: "冠軍", medal: "🥇", amount: pool.payouts.first, ratio: group.payout_first, entry: rows[0] },
    { place: "亞軍", medal: "🥈", amount: pool.payouts.second, ratio: group.payout_second, entry: rows[1] },
    { place: "季軍", medal: "🥉", amount: pool.payouts.third, ratio: group.payout_third, entry: rows[2] },
  ];

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-white">📊 {group.name} · 群組總覽</h2>
        <span className="text-xs text-slate-500">{rows.length} 位成員</span>
      </div>

      {hasPool && (
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-amber-300">💰 現有獎池</span>
            <span className="text-lg font-bold text-amber-200">
              {formatCurrency(pool.pool)}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            基本買入 {formatCurrency(pool.buyinTotal)}（{rows.length} 人 ×{" "}
            {formatCurrency(group.buyin_amount)}）
            {group.rebuy_amount > 0 && (
              <>
                {" ＋ "}額外買入 {formatCurrency(pool.rebuyTotal)}（{totalRebuys}{" "}
                次 × {formatCurrency(group.rebuy_amount)}）
              </>
            )}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {podium.map((p) => (
              <div
                key={p.place}
                className="rounded-md bg-slate-900/70 px-2 py-1.5 text-center"
              >
                <div className="text-[11px] text-slate-400">
                  {p.medal} {p.place}（{p.ratio}%）
                </div>
                <div className="text-sm font-semibold text-white">
                  {formatCurrency(p.amount)}
                </div>
                <div className="truncate text-[11px] text-amber-300/80">
                  {p.entry ? p.entry.display_name : "—"}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-slate-600">
            分獎對象按目前淨資產排名投影，賽季結束時以最終排名為準。
          </p>
        </div>
      )}

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
