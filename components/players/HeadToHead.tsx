"use client";

import { useState } from "react";
import type { PlayerInsight } from "@/lib/actions/player-insights";
import { formatCurrency, cn } from "@/lib/utils";

type MetricDir = "high" | "low";
type Metric = {
  label: string;
  get: (p: PlayerInsight) => number;
  fmt: (v: number) => string;
  dir: MetricDir; // which side "wins" the highlight
};

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const money = (v: number) => formatCurrency(v);
const plain = (v: number) => `${v}`;

const METRICS: Metric[] = [
  { label: "淨資產", get: (p) => p.netWorth, fmt: money, dir: "high" },
  { label: "盈虧", get: (p) => p.profitLoss, fmt: (v) => `${v >= 0 ? "+" : ""}${money(v)}`, dir: "high" },
  { label: "ROI", get: (p) => p.roi, fmt: pct, dir: "high" },
  { label: "勝率", get: (p) => p.winRate, fmt: pct, dir: "high" },
  { label: "總注數", get: (p) => p.totalBets, fmt: plain, dir: "high" },
  { label: "平均賠率", get: (p) => p.avgOdds, fmt: (v) => v.toFixed(2), dir: "high" },
  { label: "平均注碼", get: (p) => p.avgStake, fmt: money, dir: "high" },
  { label: "過關比例", get: (p) => p.parlayPct, fmt: pct, dir: "high" },
  { label: "最大單場贏", get: (p) => p.biggestWin, fmt: money, dir: "high" },
  { label: "最長連勝", get: (p) => p.longestWinStreak, fmt: plain, dir: "high" },
  { label: "最長連敗", get: (p) => p.longestLossStreak, fmt: plain, dir: "low" },
  { label: "重買次數", get: (p) => p.rebuys, fmt: plain, dir: "low" },
];

export default function HeadToHead({ players }: { players: PlayerInsight[] }) {
  const [aId, setAId] = useState(players[0]?.id ?? "");
  const [bId, setBId] = useState(players[1]?.id ?? players[0]?.id ?? "");

  const a = players.find((p) => p.id === aId) ?? null;
  const b = players.find((p) => p.id === bId) ?? null;

  return (
    <div className="card p-4">
      <h2 className="mb-3 font-semibold text-white">⚔️ 單挑比較</h2>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={aId}
          onChange={(e) => setAId(e.target.value)}
          className="form-input text-sm py-2"
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={bId}
          onChange={(e) => setBId(e.target.value)}
          className="form-input text-sm py-2"
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {a && b && a.id !== b.id ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="py-1.5 text-right font-medium">{a.name}</th>
                <th className="py-1.5 text-center font-medium">項目</th>
                <th className="py-1.5 text-left font-medium">{b.name}</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const va = m.get(a);
                const vb = m.get(b);
                const aWins = m.dir === "high" ? va > vb : va < vb;
                const bWins = m.dir === "high" ? vb > va : vb < va;
                return (
                  <tr key={m.label} className="border-t border-slate-800">
                    <td
                      className={cn(
                        "py-1.5 pr-2 text-right",
                        aWins ? "font-bold text-emerald-400" : "text-slate-300"
                      )}
                    >
                      {m.fmt(va)}
                    </td>
                    <td className="py-1.5 text-center text-[11px] text-slate-500">
                      {m.label}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 pl-2 text-left",
                        bWins ? "font-bold text-emerald-400" : "text-slate-300"
                      )}
                    >
                      {m.fmt(vb)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-slate-700">
                <td className="py-1.5 pr-2 text-right text-xs text-amber-300">
                  {a.riskStyle.emoji} {a.riskStyle.label}
                </td>
                <td className="py-1.5 text-center text-[11px] text-slate-500">風格</td>
                <td className="py-1.5 pl-2 text-left text-xs text-amber-300">
                  {b.riskStyle.emoji} {b.riskStyle.label}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">請選擇兩位不同的玩家比較。</p>
      )}
    </div>
  );
}
