"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import {
  settleBet,
  settleParlayLeg,
} from "@/lib/actions/settle";
import {
  parseParlay,
  serializeParlay,
  type ParlayLeg,
} from "@/lib/parlay";
import type { BetStatus } from "@/lib/types";
import {
  cn,
  formatCurrency,
  formatHKTime,
  getStatusLabel,
} from "@/lib/utils";

type SettlementResult = Exclude<BetStatus, "pending">;

const SETTLEMENT_OPTIONS: Array<{
  result: SettlementResult;
  label: string;
  className: string;
}> = [
  { result: "won", label: "贏", className: "bg-emerald-600 hover:bg-emerald-700" },
  { result: "half_won", label: "贏半", className: "bg-lime-600 hover:bg-lime-700" },
  { result: "lost", label: "輸", className: "bg-red-600 hover:bg-red-700" },
  { result: "half_lost", label: "輸半", className: "bg-orange-600 hover:bg-orange-700" },
  { result: "void", label: "走盤", className: "bg-slate-600 hover:bg-slate-500" },
];

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

type ConfirmState = {
  betId: string;
  legId?: string;
  result: SettlementResult;
} | null;

export default function SettlePanel({ initialBets }: { initialBets: BetRow[] }) {
  const [bets, setBets] = useState(initialBets);
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const pendingBets = bets.filter((bet) => bet.status === "pending");

  const submitSettlement = () => {
    if (!confirm) return;

    startTransition(async () => {
      const result = confirm.legId
        ? await settleParlayLeg(
            confirm.betId,
            confirm.legId,
            confirm.result
          )
        : await settleBet(confirm.betId, confirm.result);

      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      setBets((current) =>
        current.map((bet) => {
          if (bet.id !== confirm.betId) return bet;

          if ("legs" in result && result.legs) {
            return {
              ...bet,
              selection: serializeParlay({
                version: 1,
                legs: result.legs as ParlayLeg[],
              }),
              status: result.complete ? result.status ?? bet.status : "pending",
              payout: result.payout ?? 0,
            };
          }

          return {
            ...bet,
            status: confirm.result,
            payout: result.payout ?? 0,
          };
        })
      );

      toast.success(
        "complete" in result && !result.complete
          ? `此關已標記為${getStatusLabel(confirm.result)}`
          : `結算完成，派彩 ${formatCurrency(result.payout ?? 0)}`
      );
      setConfirm(null);
    });
  };

  if (pendingBets.length === 0) {
    return (
      <div className="card p-12 text-center text-slate-500">
        <p className="font-medium">暫無待結算投注</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        待結算：<span className="font-bold text-white">{pendingBets.length}</span>{" "}
        筆
      </p>

      {pendingBets.map((bet) => {
        const parlay = parseParlay(bet.selection);
        return (
          <div key={bet.id} className="card p-4 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-semibold text-white">
                  {bet.profiles?.display_name ?? "未命名"}
                </span>
                <span className="text-slate-400 text-sm ml-2">
                  {parlay ? `${parlay.legs.length} 關過關` : bet.bet_type}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {formatHKTime(bet.created_at, "MM/dd HH:mm")}
              </span>
            </div>

            <div className="grid grid-cols-3 text-center text-xs">
              <Summary label="本金" value={formatCurrency(bet.stake)} />
              <Summary label="總賠率" value={String(bet.odds)} />
              <Summary
                label="最高派彩"
                value={formatCurrency(bet.possible_return)}
              />
            </div>

            {parlay ? (
              <div className="space-y-3">
                {parlay.legs.map((leg, index) => (
                  <div
                    key={leg.id}
                    className="rounded-xl border border-slate-700 bg-slate-800/50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          第 {index + 1} 關 · {leg.home_team} vs {leg.away_team}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {leg.bet_type} · {leg.selection} @ {leg.odds}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          {formatHKTime(leg.kickoff_time, "MM/dd HH:mm")} HKT
                        </p>
                      </div>
                      <StatusPill status={leg.status} />
                    </div>

                    {leg.status === "pending" && (
                      <SettlementButtons
                        disabled={pending}
                        onSelect={(result) =>
                          setConfirm({
                            betId: bet.id,
                            legId: leg.id,
                            result,
                          })
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <>
                {bet.matches && (
                  <p className="text-xs text-slate-400">
                    {bet.matches.home_team} vs {bet.matches.away_team} ·{" "}
                    {formatHKTime(bet.matches.kickoff_time, "MM/dd HH:mm")}
                  </p>
                )}
                <div className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
                  <span className="font-medium text-white">{bet.selection}</span>
                  <span className="text-slate-400 ml-2">@ {bet.odds}</span>
                </div>
                <SettlementButtons
                  disabled={pending}
                  onSelect={(result) =>
                    setConfirm({ betId: bet.id, result })
                  }
                />
              </>
            )}

            {confirm?.betId === bet.id && (
              <div className="rounded-xl bg-slate-900 p-3">
                <p className="text-center text-sm text-white">
                  確認標記為{" "}
                  <strong>{getStatusLabel(confirm.result)}</strong>？
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={submitSettlement}
                    disabled={pending}
                    className="btn-primary flex-1 py-2 text-sm"
                  >
                    {pending ? "處理中" : "確認"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(null)}
                    className="btn-secondary flex-1 py-2 text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className="font-semibold text-white mt-1">{value}</p>
    </div>
  );
}

function SettlementButtons({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (result: SettlementResult) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {SETTLEMENT_OPTIONS.map((option) => (
        <button
          key={option.result}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option.result)}
          className={cn(
            "rounded-lg py-2 text-xs font-semibold text-white disabled:opacity-50",
            option.className
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: BetStatus }) {
  const colors: Record<BetStatus, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    won: "bg-emerald-500/20 text-emerald-400",
    half_won: "bg-lime-500/20 text-lime-400",
    lost: "bg-red-500/20 text-red-400",
    half_lost: "bg-orange-500/20 text-orange-400",
    void: "bg-slate-500/20 text-slate-400",
  };

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs", colors[status])}>
      {getStatusLabel(status)}
    </span>
  );
}
