"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { requestSeason2Loan } from "@/lib/actions/loans-season2";
import { formatCurrency } from "@/lib/utils";
import { SEASON2_LOAN } from "@/lib/season2-loans";

type Props = {
  currentBalance: number;
  outstandingDebt: number;
  loanCount: number;
  netWorth: number;
  eligible: boolean;
  reason: string | null;
};

const CONFIRM_MESSAGE =
  "你將借入 $500，並產生 $550 欠款。贏取的派彩會優先用作還款。每季最多借款兩次。";

export default function Season2LoanCard({
  currentBalance,
  outstandingDebt,
  loanCount,
  netWorth,
  eligible,
  reason,
}: Props) {
  const [pending, startTransition] = useTransition();

  const handleBorrow = () => {
    if (!eligible) return;
    if (!window.confirm(CONFIRM_MESSAGE)) return;
    startTransition(async () => {
      const result = await requestSeason2Loan();
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("已提交借款申請，待管理員批核");
      window.location.reload();
    });
  };

  return (
    <div className="card p-4 space-y-3 border-orange-500/30">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">借錢搏一搏</h2>
        <span className="text-xs text-orange-400">
          借款會從龍虎榜資產扣除
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Tile label="現時餘額" value={formatCurrency(currentBalance)} />
        <Tile
          label="尚欠"
          value={formatCurrency(outstandingDebt)}
          highlight={outstandingDebt > 0}
        />
        <Tile label="重買次數" value={`${loanCount}（無限）`} />
        <Tile label="淨資產" value={formatCurrency(netWorth)} />
      </div>

      {outstandingDebt > 0 && (
        <p className="rounded-lg bg-orange-500/10 px-3 py-2 text-[11px] text-orange-300">
          尚有欠款：單注上限 $100、暫停過關，贏取的派彩會自動優先還款。
        </p>
      )}

      <button
        type="button"
        onClick={handleBorrow}
        disabled={!eligible || pending}
        className="w-full rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? "申請中…"
          : eligible
          ? `借入 $${SEASON2_LOAN.amount}（欠 $${SEASON2_LOAN.debt}）`
          : reason ?? "暫不符合借款資格"}
      </button>
    </div>
  );
}

function Tile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-900/70 px-3 py-2">
      <p className="text-slate-500">{label}</p>
      <p className={highlight ? "font-semibold text-orange-300" : "font-semibold text-white"}>
        {value}
      </p>
    </div>
  );
}
