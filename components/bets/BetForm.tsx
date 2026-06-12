"use client";

import { useState, useTransition } from "react";
import { createBet } from "@/lib/actions/bets";
import { BET_TYPES } from "@/lib/types";
import { formatCurrency, formatHKTime, cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Match } from "@/lib/types";

interface BetFormProps {
  matches: Match[];
  currentBalance: number;
}

export default function BetForm({ matches, currentBalance }: BetFormProps) {
  const [isPending, startTransition] = useTransition();
  const [stake, setStake] = useState("");
  const [odds, setOdds] = useState("");
  const [matchId, setMatchId] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const stakeNum = parseFloat(stake) || 0;
  const oddsNum = parseFloat(odds) || 0;
  const possibleReturn = stakeNum > 0 && oddsNum > 1 ? stakeNum * oddsNum : 0;
  const isAllIn = stakeNum > currentBalance * 0.5;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createBet(fd);
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else if ("success" in res && res.success) {
        toast.success(
          `✅ 投注成功！扣除 ${formatCurrency(stakeNum)}，剩餘 ${formatCurrency(res.new_balance as number)}`,
          { duration: 5000 }
        );
        setSubmitted(true);
      }
    });
  };

  if (submitted) {
    return (
      <div className="card p-8 text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-bold text-white">投注成功！</h2>
        <p className="text-slate-400 text-sm">現時餘額：{formatCurrency(currentBalance - stakeNum)}</p>
        <div className="flex gap-3">
          <button onClick={() => setSubmitted(false)} className="btn-primary flex-1">
            繼續投注
          </button>
          <a href="/bets-board" className="btn-secondary flex-1 text-center py-2.5">
            投注版
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Balance indicator */}
      <div className="card p-4 flex items-center justify-between">
        <span className="text-slate-400 text-sm">可用餘額</span>
        <span className="font-bold text-white">{formatCurrency(currentBalance)}</span>
      </div>

      {/* Match selector */}
      <div>
        <label className="form-label">賽事</label>
        <select
          name="match_id"
          required
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          className="form-input appearance-none"
        >
          <option value="">選擇賽事…</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {m.home_team} vs {m.away_team} —{" "}
              {formatHKTime(m.kickoff_time, "MM/dd HH:mm")}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">
          讓球請在投注選項填寫球隊及盤口，例如：香港 +0.25
        </p>
      </div>

      {/* Bet type */}
      <div>
        <label className="form-label">投注種類</label>
        <select name="bet_type" required className="form-input appearance-none">
          <option value="">選擇種類…</option>
          {BET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Selection */}
      <div>
        <label className="form-label">
          投注選項
          <span className="text-slate-500 font-normal ml-1 text-xs">（例：主勝 / Over 2.5 / 2-1）</span>
        </label>
        <input
          name="selection"
          type="text"
          required
          placeholder="填入你的選項…"
          maxLength={100}
          className="form-input"
        />
      </div>

      {/* Odds */}
      <div>
        <label className="form-label">賠率（必須 &gt; 1）</label>
        <input
          name="odds"
          type="number"
          required
          min="1.01"
          step="0.01"
          placeholder="例：1.85"
          value={odds}
          onChange={(e) => setOdds(e.target.value)}
          className="form-input"
        />
      </div>

      {/* Stake */}
      <div>
        <label className="form-label">投注額 (HK$)</label>
        <input
          name="stake"
          type="number"
          required
          min="1"
          step="1"
          max={currentBalance}
          placeholder="例：50"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          className="form-input"
        />
        {/* Quick stake buttons */}
        <div className="flex gap-2 mt-2">
          {[10, 20, 50, 100].map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setStake(String(Math.min(amt, currentBalance)))}
              className={cn(
                "flex-1 text-xs py-1.5 rounded-lg border transition-colors",
                stakeNum === amt
                  ? "border-brand-500 text-brand-400 bg-brand-500/10"
                  : "border-slate-700 text-slate-400 hover:border-slate-600"
              )}
            >
              ${amt}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setStake(String(currentBalance))}
            className={cn(
              "flex-1 text-xs py-1.5 rounded-lg border transition-colors",
              stakeNum === currentBalance
                ? "border-red-500 text-red-400 bg-red-500/10"
                : "border-slate-700 text-slate-400 hover:border-slate-600"
            )}
          >
            全押
          </button>
        </div>
      </div>

      {/* All-in warning */}
      {isAllIn && stakeNum > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
          <span className="text-lg">⚠️</span>
          <div>
            <p className="text-red-400 text-sm font-semibold">全押警告！</p>
            <p className="text-red-400/70 text-xs mt-0.5">
              此注超過你一半餘額，請三思而後行！
            </p>
          </div>
        </div>
      )}

      {/* Return preview */}
      {possibleReturn > 0 && (
        <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-4">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-sm">預計回報</span>
            <span className="text-brand-400 font-bold text-xl">
              {formatCurrency(possibleReturn)}
            </span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-slate-500 text-xs">淨盈利</span>
            <span className="text-emerald-400 text-sm font-medium">
              +{formatCurrency(possibleReturn - stakeNum)}
            </span>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || stakeNum <= 0 || stakeNum > currentBalance || oddsNum <= 1}
        className="btn-primary w-full py-4 text-base"
      >
        {isPending ? "提交中…" : "確認落注"}
      </button>
    </form>
  );
}
