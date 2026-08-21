"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import {
  approveSeason2Loan,
  rejectSeason2Loan,
} from "@/lib/actions/loans-season2";
import { formatCurrency } from "@/lib/utils";
import { loanEligibility } from "@/lib/season2-loans";

type Request = {
  id: string;
  amount: number;
  fee: number;
  requested_at: string;
  profiles: { display_name: string } | null;
  season_players: {
    current_balance: number;
    outstanding_debt: number;
    loan_count: number;
  } | null;
};

export default function LoanRequestList({ requests }: { requests: Request[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = (id: string, fn: () => Promise<{ error?: string }>) => {
    setBusyId(id);
    startTransition(async () => {
      const result = await fn();
      setBusyId(null);
      if (result.error) toast.error(result.error);
      else {
        toast.success("已處理");
        window.location.reload();
      }
    });
  };

  if (requests.length === 0) {
    return (
      <div className="card p-12 text-center text-slate-500">
        <div className="mb-3 text-4xl">💸</div>
        <p>暫無待批核的借款申請</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {requests.map((request) => {
        const sp = request.season_players;
        const eligibility = sp
          ? loanEligibility({
              currentBalance: sp.current_balance,
              outstandingDebt: sp.outstanding_debt,
              loanCount: sp.loan_count,
            })
          : { allowed: true, reason: null };
        return (
          <div key={request.id} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-white">
                  {request.profiles?.display_name ?? "—"}
                </p>
                <p className="text-xs text-slate-500">
                  借 {formatCurrency(request.amount)} · 欠{" "}
                  {formatCurrency(request.amount + request.fee)}
                  {sp &&
                    ` · 餘額 ${formatCurrency(sp.current_balance)} · 已借 ${sp.loan_count} 次`}
                </p>
                {!eligibility.allowed && (
                  <p className="mt-0.5 text-[11px] text-red-400">
                    ⚠ {eligibility.reason}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={pending && busyId === request.id}
                  onClick={() =>
                    act(request.id, () => approveSeason2Loan(request.id))
                  }
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  批准
                </button>
                <button
                  type="button"
                  disabled={pending && busyId === request.id}
                  onClick={() =>
                    act(request.id, () =>
                      rejectSeason2Loan(
                        request.id,
                        window.prompt("拒絕原因（可選）") ?? ""
                      )
                    )
                  }
                  className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
                >
                  拒絕
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
