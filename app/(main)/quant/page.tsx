import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUpcomingMatches } from "@/lib/actions/matches";
import { getBetOptionsForMatches } from "@/lib/actions/odds";
import { analyzeFixture, getModelMeta } from "@/lib/quant/model";
import {
  evaluateOptions,
  VALUE_EV_THRESHOLD,
  type EvaluatedOption,
} from "@/lib/quant/evaluate";
import type { Match } from "@/lib/types";
import { cn, formatCurrency, formatHKTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MAX_ROWS_PER_MATCH = 12;

function percent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function suggestedStake(kelly: number, balance: number) {
  // Quarter Kelly, capped at 10% of bankroll.
  const stake = Math.min(balance * (kelly / 4), balance * 0.1);
  return stake >= 1 ? Math.floor(stake) : 0;
}

export default async function QuantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("current_balance")
    .eq("id", user.id)
    .single();
  const balance = profile?.current_balance ?? 0;

  const { matches } = await getUpcomingMatches();
  const fixtures = (matches as Match[]).filter(
    (match) => match.stage !== "特別項目"
  );
  const optionsByMatchId = await getBetOptionsForMatches(fixtures);
  const meta = getModelMeta();

  const boards = fixtures.map((match) => {
    const analysis = analyzeFixture(match.home_team, match.away_team);
    const options = optionsByMatchId[match.id] ?? [];
    const rows = analysis
      ? evaluateOptions(options, match.home_team, match.away_team, analysis)
      : [];
    return { match, analysis, rows };
  });

  const totalValueBets = boards.reduce(
    (sum, board) => sum + board.rows.filter((row) => row.isValue).length,
    0
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          📈 量化分析
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Elo + Dixon-Coles 泊松模型 · 獨立估算機率，對比馬會賠率尋找價值
        </p>
      </div>

      {/* Model card */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">模型狀態</h2>
          <span className="text-xs text-slate-500">
            數據截至 {meta.lastMatchDate} · {meta.totalMatches.toLocaleString()} 場國際賽
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <MetaTile
            label="回測 Brier（模型 / 基準）"
            value={`${meta.backtest.brier.model.toFixed(3)} / ${meta.backtest.brier.baseline.toFixed(3)}`}
            good={meta.backtest.brier.model < meta.backtest.brier.baseline}
          />
          <MetaTile
            label="回測 Log Loss（模型 / 基準）"
            value={`${meta.backtest.logLoss.model.toFixed(3)} / ${meta.backtest.logLoss.baseline.toFixed(3)}`}
            good={meta.backtest.logLoss.model < meta.backtest.logLoss.baseline}
          />
          <MetaTile
            label={`回測命中率（${meta.backtest.matches.toLocaleString()} 場）`}
            value={percent(meta.backtest.accuracy)}
            good
          />
          <MetaTile
            label="現時價值投注"
            value={`${totalValueBets} 個（EV ≥ ${percent(VALUE_EV_THRESHOLD, 0)}）`}
            good={totalValueBets > 0}
          />
        </div>
        <p className="text-[11px] leading-relaxed text-slate-600">
          回測為 {meta.backtest.evalStart} 起的走前（walk-forward）驗證，全部樣本外。模型機率為獨立統計估算，並非複製馬會賠率；投注建議僅供參考。
        </p>
      </div>

      {boards.length === 0 && (
        <div className="card p-12 text-center text-slate-500">
          <div className="text-4xl mb-3">📉</div>
          <p>暫無可分析的即將開賽賽事</p>
        </div>
      )}

      {boards.map(({ match, analysis, rows }) => (
        <div key={match.id} className="card p-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-white">
                {match.home_team} vs {match.away_team}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatHKTime(match.kickoff_time, "MM/dd HH:mm")} HKT
                {match.stage && ` · ${match.stage}`}
              </p>
            </div>
            {analysis && <ConfidencePill level={analysis.confidence} />}
          </div>

          {!analysis ? (
            <p className="rounded-lg bg-slate-800/60 p-3 text-sm text-slate-400">
              未能對應歷史數據中的球隊名稱，暫無法分析此賽事。
            </p>
          ) : (
            <>
              {/* Probability bar */}
              <div>
                <div className="flex h-7 overflow-hidden rounded-lg text-[11px] font-bold text-white">
                  <div
                    className="flex items-center justify-center bg-emerald-600/80"
                    style={{ width: `${analysis.probabilities.home * 100}%` }}
                  >
                    {percent(analysis.probabilities.home, 0)}
                  </div>
                  <div
                    className="flex items-center justify-center bg-slate-600/80"
                    style={{ width: `${analysis.probabilities.draw * 100}%` }}
                  >
                    {percent(analysis.probabilities.draw, 0)}
                  </div>
                  <div
                    className="flex items-center justify-center bg-sky-600/80"
                    style={{ width: `${analysis.probabilities.away * 100}%` }}
                  >
                    {percent(analysis.probabilities.away, 0)}
                  </div>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                  <span>主勝 {match.home_team}</span>
                  <span>和局</span>
                  <span>客勝 {match.away_team}</span>
                </div>
              </div>

              {/* Model internals */}
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <MetaTile
                  label="Elo（主 / 客）"
                  value={`${Math.round(analysis.homeRating)} / ${Math.round(analysis.awayRating)}`}
                />
                <MetaTile
                  label="預期入球（主 / 客）"
                  value={`${analysis.lambdaHome.toFixed(2)} / ${analysis.lambdaAway.toFixed(2)}`}
                />
                <MetaTile
                  label="最可能比分"
                  value={analysis.topScores
                    .map((s) => `${s.home}:${s.away}`)
                    .join("、")}
                />
                <MetaTile
                  label="模型一致度（Elo vs DC）"
                  value={percent(analysis.modelAgreement, 0)}
                  good={analysis.modelAgreement >= 0.9}
                />
              </div>
              {!analysis.neutralVenue && (
                <p className="text-[11px] text-amber-400/80">
                  主辦國球隊：已計入主場優勢。
                </p>
              )}

              {/* Options table */}
              {rows.length === 0 ? (
                <p className="text-xs text-slate-600">
                  暫無可解析的馬會盤口（支援：主客和 / 全場讓球 / 全場入球大細 / 全場波膽）。
                </p>
              ) : (
                <OptionsTable rows={rows.slice(0, MAX_ROWS_PER_MATCH)} balance={balance} />
              )}
            </>
          )}
        </div>
      ))}

      <p className="text-[11px] leading-relaxed text-slate-600">
        EV（期望值）= 模型機率 × 賠率 −
        1。市場機率為同一盤口全部選項去除賠率水位（overround）後的公平機率。建議注碼為四分一凱利（Quarter
        Kelly），上限為結餘 10%。馬會賠率含較高水位，正 EV 機會罕見屬正常；模型不構成任何投注保證。
      </p>
    </div>
  );
}

function MetaTile({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-800/60 px-3 py-2">
      <p className="text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-semibold",
          good === undefined ? "text-white" : good ? "text-emerald-400" : "text-slate-300"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ConfidencePill({ level }: { level: "high" | "medium" | "low" }) {
  const map = {
    high: { label: "信心：高", className: "bg-emerald-500/15 text-emerald-300" },
    medium: { label: "信心：中", className: "bg-yellow-500/15 text-yellow-300" },
    low: { label: "信心：低", className: "bg-red-500/15 text-red-300" },
  } as const;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        map[level].className
      )}
    >
      {map[level].label}
    </span>
  );
}

function OptionsTable({
  rows,
  balance,
}: {
  rows: EvaluatedOption[];
  balance: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-slate-500">
            <th className="py-1.5 pr-2 font-medium">盤口</th>
            <th className="py-1.5 pr-2 text-right font-medium">賠率</th>
            <th className="py-1.5 pr-2 text-right font-medium">模型機率</th>
            <th className="py-1.5 pr-2 text-right font-medium">市場機率</th>
            <th className="py-1.5 pr-2 text-right font-medium">EV</th>
            <th className="py-1.5 text-right font-medium">建議注碼</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stake = suggestedStake(row.kelly, balance);
            return (
              <tr
                key={row.optionId}
                className={cn(
                  "border-t border-slate-800",
                  row.isValue && "bg-emerald-500/5"
                )}
              >
                <td className="py-1.5 pr-2 text-slate-200">
                  {row.isValue && <span className="mr-1">💎</span>}
                  {row.selection}
                </td>
                <td className="py-1.5 pr-2 text-right text-white">
                  {row.odds.toFixed(2)}
                </td>
                <td className="py-1.5 pr-2 text-right text-slate-300">
                  {percent(row.modelProbability)}
                </td>
                <td className="py-1.5 pr-2 text-right text-slate-500">
                  {row.marketProbability !== null
                    ? percent(row.marketProbability)
                    : "—"}
                </td>
                <td
                  className={cn(
                    "py-1.5 pr-2 text-right font-semibold",
                    row.ev >= VALUE_EV_THRESHOLD
                      ? "text-emerald-400"
                      : row.ev >= 0
                      ? "text-slate-300"
                      : "text-red-400/80"
                  )}
                >
                  {(row.ev * 100).toFixed(1)}%
                </td>
                <td className="py-1.5 text-right text-slate-300">
                  {stake > 0 ? formatCurrency(stake) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
