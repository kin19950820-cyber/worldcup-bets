import { getWeeklyRecaps } from "@/lib/actions/weekly";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${formatCurrency(value)}`;
}

export default async function WeeklyPage() {
  const recaps = await getWeeklyRecaps();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold text-white">
        📅 每週戰報
      </h1>
      <p className="mb-6 text-sm text-slate-400">
        每個英超輪次的淨盈虧王者、爆冷與戰況
      </p>

      {recaps.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <div className="mb-3 text-4xl">📅</div>
          <p>暫無已結算的每週戰績</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Weekly champions mini table */}
          <div className="card p-4">
            <h2 className="mb-3 font-semibold text-white">🏆 每週王者</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="py-1.5 pr-2 font-medium">輪次</th>
                    <th className="py-1.5 px-2 font-medium">王者</th>
                    <th className="py-1.5 pl-2 text-right font-medium">淨賺</th>
                  </tr>
                </thead>
                <tbody>
                  {recaps.map((r) => (
                    <tr key={r.gameweek} className="border-t border-slate-800">
                      <td className="py-2 pr-2">
                        <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-semibold text-brand-300">
                          GW{r.gameweek} 王者
                        </span>
                      </td>
                      <td className="py-2 px-2 font-medium text-white">
                        {r.champion?.name ?? "—"}
                      </td>
                      <td
                        className={`py-2 pl-2 text-right font-semibold ${
                          (r.champion?.profit ?? 0) >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {r.champion ? signed(r.champion.profit) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-gameweek recap cards */}
          {recaps.map((r) => (
            <div key={r.gameweek} className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-white">{r.label}戰報</h2>
                <span className="text-xs text-slate-500">
                  {r.betCount} 注 · 共投注 {formatCurrency(r.totalStaked)}
                </span>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Stat
                  icon="🥇"
                  label="王者"
                  main={r.champion?.name ?? "—"}
                  sub={r.champion ? signed(r.champion.profit) : ""}
                  accent="text-emerald-400"
                />
                <Stat
                  icon="💀"
                  label="爆煲"
                  main={r.loser?.name ?? "—"}
                  sub={r.loser ? signed(r.loser.loss) : "本輪無虧損"}
                  accent="text-red-400"
                />
                <Stat
                  icon="🌚"
                  label="最大冷門"
                  main={r.biggestUpset?.name ?? "—"}
                  sub={
                    r.biggestUpset
                      ? `@ ${r.biggestUpset.odds.toFixed(2)} · ${r.biggestUpset.detail}`
                      : "本輪無爆冷"
                  }
                  accent="text-amber-300"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="py-1 pr-2 font-medium">玩家</th>
                      <th className="py-1 px-2 text-right font-medium">本輪盈虧</th>
                      <th className="py-1 pl-2 text-right font-medium">注數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.standings.map((s) => (
                      <tr key={s.name} className="border-t border-slate-800/70">
                        <td className="py-1.5 pr-2 text-slate-200">{s.name}</td>
                        <td
                          className={`py-1.5 px-2 text-right font-semibold ${
                            s.profit >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {signed(s.profit)}
                        </td>
                        <td className="py-1.5 pl-2 text-right text-slate-500">
                          {s.bets}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  main,
  sub,
  accent,
}: {
  icon: string;
  label: string;
  main: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg bg-slate-800/60 px-3 py-2">
      <p className="text-[11px] text-slate-500">
        {icon} {label}
      </p>
      <p className="truncate font-semibold text-white">{main}</p>
      <p className={`truncate text-xs ${accent}`}>{sub}</p>
    </div>
  );
}
