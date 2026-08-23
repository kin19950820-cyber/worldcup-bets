import { getPlayerInsights } from "@/lib/actions/player-insights";
import HeadToHead from "@/components/players/HeadToHead";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const players = await getPlayerInsights();
  const withBets = players.filter((p) => p.totalBets > 0);

  // 逆轉王: biggest recovery from a player's lowest net worth, only when they
  // actually dipped below their starting point.
  const comebacks = [...withBets]
    .filter((p) => p.historicalLow < p.netWorth && p.recovery > 0)
    .sort((a, b) => b.recovery - a.recovery)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          🧑‍🤝‍🧑 玩家分析
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          單挑比較、風格標籤同逆轉王
        </p>
      </div>

      {withBets.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <div className="mb-3 text-4xl">🧑‍🤝‍🧑</div>
          <p>暫無玩家投注數據</p>
        </div>
      ) : (
        <>
          <HeadToHead players={withBets} />

          {/* Comeback kings */}
          {comebacks.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 font-semibold text-white">🔄 逆轉王</h2>
              <p className="mb-3 text-[11px] text-slate-500">
                由最低身家反彈得最多的玩家
              </p>
              <div className="space-y-2">
                {comebacks.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span>{["🥇", "🥈", "🥉"][i]}</span>
                      <span className="font-medium text-white">{p.name}</span>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-semibold text-emerald-400">
                        反彈 {formatCurrency(p.recovery)}
                      </p>
                      <p className="text-slate-500">
                        低見 {formatCurrency(p.historicalLow)} → 現 {formatCurrency(p.netWorth)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk profiles */}
          <div className="card p-4">
            <h2 className="mb-3 font-semibold text-white">🎭 玩家風格</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {withBets.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{p.name}</p>
                    <p className="text-[11px] text-slate-500">
                      均賠 {p.avgOdds.toFixed(2)} · 均注 {formatCurrency(p.avgStake)} · 過關 {(p.parlayPct * 100).toFixed(0)}%
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-300">
                    {p.riskStyle.emoji} {p.riskStyle.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
