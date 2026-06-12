"use client";

import { useState, useTransition } from "react";
import { settleBet } from "@/lib/actions/settle";
import { formatCurrency, formatHKTime, cn } from "@/lib/utils";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";

const Confetti = dynamic(() => import("@/components/ui/Confetti"), { ssr: false });

type BetRow = {
  id: string;
  bet_type: string;
  selection: string;
  odds: number;
  stake: number;
  possible_return: number;
  payout: number;
  status: string;
  created_at: string;
  profiles: { display_name: string; current_balance: number } | null;
  matches: {
    home_team: string;
    away_team: string;
    kickoff_time: string;
    stage: string | null;
  } | null;
};

interface Props {
  initialBets: BetRow[];
}

export default function SettlePanel({ initialBets }: Props) {
  const [bets, setBets] = useState<BetRow[]>(initialBets);
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<"won" | "lost" | "void" | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const pendingBets = bets.filter((b) => b.status === "pending");

  const handleSettle = (betId: string, result: "won" | "lost" | "void") => {
    startTransition(async () => {
      const res = await settleBet(betId, result);

      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }

      // Update local state
      setBets((prev) =>
        prev.map((b) =>
          b.id === betId
            ? { ...b, status: result, payout: res.payout ?? 0 }
            : b
        )
      );

      setConfirmId(null);
      setConfirmResult(null);

      if (result === "won") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
        toast.success(
          `🎉 恭喜！${res.playerName} 贏咗 ${formatCurrency(res.payout ?? 0)}，目前結餘 ${formatCurrency(res.newBalance ?? 0)}`,
          { duration: 6000, icon: "🏆" }
        );
      } else if (result === "lost") {
        toast.error(
          `😢 ${res.playerName} 輸咗，扣除本金 ${formatCurrency(res.stake ?? 0)}，目前結餘 ${formatCurrency(res.newBalance ?? 0)}`,
          { duration: 5000 }
        );
      } else {
        toast(
          `↩️ 投注取消，${res.playerName} 退回本金 ${formatCurrency(res.stake ?? 0)}`,
          { duration: 5000 }
        );
      }
    });
  };

  if (pendingBets.length === 0) {
    return (
      <div className="card p-12 text-center text-slate-500">
        <div className="text-5xl mb-4">✅</div>
        <p className="font-medium">暫無待結算投注</p>
        <p className="text-sm mt-1">所有投注已處理</p>
      </div>
    );
  }

  return (
    <>
      {showConfetti && <Confetti />}

      <div className="mb-4 text-sm text-slate-400">
        待結算：<span className="text-white font-bold">{pendingBets.length}</span> 筆
      </div>

      <div className="space-y-3">
        {pendingBets.map((bet) => (
          <div key={bet.id} className="card p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-semibold text-white">
                  {bet.profiles?.display_name ?? "—"}
                </span>
                <span className="text-slate-400 text-sm ml-2">{bet.bet_type}</span>
              </div>
              <span className="text-xs text-slate-500">
                {formatHKTime(bet.created_at, "MM/dd HH:mm")}
              </span>
            </div>

            {/* Match */}
            {bet.matches && (
              <p className="text-xs text-slate-400">
                ⚽ {bet.matches.home_team} vs {bet.matches.away_team}
                {" · "}
                {formatHKTime(bet.matches.kickoff_time, "MM/dd HH:mm")}
              </p>
            )}

            {/* Selection */}
            <div className="bg-slate-800 rounded-lg px-3 py-2 text-sm">
              <span className="text-white font-medium">{bet.selection}</span>
              <span className="text-slate-400 ml-2">@ {bet.odds}</span>
            </div>

            {/* Financials */}
            <div className="grid grid-cols-3 text-center text-xs">
              <div>
                <p className="text-slate-500">本金</p>
                <p className="text-white font-semibold">{formatCurrency(bet.stake)}</p>
              </div>
              <div>
                <p className="text-slate-500">可贏</p>
                <p className="text-brand-400 font-semibold">
                  {formatCurrency(bet.possible_return)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">現餘</p>
                <p className="text-white font-semibold">
                  {formatCurrency(bet.profiles?.current_balance ?? 0)}
                </p>
              </div>
            </div>

            {/* Settle buttons or confirm */}
            {confirmId === bet.id ? (
              <div className="bg-slate-800 rounded-xl p-3 space-y-2">
                <p className="text-center text-sm text-white">
                  確認將此注標記為{" "}
                  <span
                    className={cn(
                      "font-bold",
                      confirmResult === "won"
                        ? "text-emerald-400"
                        : confirmResult === "lost"
                        ? "text-red-400"
                        : "text-slate-400"
                    )}
                  >
                    {confirmResult === "won" ? "贏" : confirmResult === "lost" ? "輸" : "取消"}
                  </span>
                  ？
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSettle(bet.id, confirmResult!)}
                    disabled={pending}
                    className="btn-primary flex-1 py-2 text-sm"
                  >
                    {pending ? "處理中…" : "確認"}
                  </button>
                  <button
                    onClick={() => { setConfirmId(null); setConfirmResult(null); }}
                    className="btn-secondary flex-1 py-2 text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmId(bet.id); setConfirmResult("won"); }}
                  disabled={pending}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2 text-sm font-semibold transition-colors"
                >
                  🏆 贏
                </button>
                <button
                  onClick={() => { setConfirmId(bet.id); setConfirmResult("lost"); }}
                  disabled={pending}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2 text-sm font-semibold transition-colors"
                >
                  ❌ 輸
                </button>
                <button
                  onClick={() => { setConfirmId(bet.id); setConfirmResult("void"); }}
                  disabled={pending}
                  className="flex-1 bg-slate-600 hover:bg-slate-500 text-white rounded-xl py-2 text-sm font-semibold transition-colors"
                >
                  ↩️ 取消
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
