"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { borrowMoney, repayMoney } from "@/lib/actions/loans";
import { formatCurrency } from "@/lib/utils";

const WARNINGS = [
  "搏一搏單車變摩托",
  "我認我係燈神",
  "今鋪仲唔一鋪返身",
];

type LoanCardProps = {
  totalBorrowed: number;
  loanPrincipal: number;
  loanInterest: number;
  effectiveWeeklyRate: number;
};

export default function LoanCard({
  totalBorrowed,
  loanPrincipal,
  loanInterest,
  effectiveWeeklyRate,
}: LoanCardProps) {
  const [amount, setAmount] = useState("500");
  const [repaymentAmount, setRepaymentAmount] = useState(
    totalBorrowed > 0 ? totalBorrowed.toFixed(2) : "100"
  );
  const [pending, startTransition] = useTransition();

  const handleBorrow = () => {
    const loanAmount = Number(amount);
    if (!Number.isFinite(loanAmount) || loanAmount < 1 || loanAmount >= 2000) {
      toast.error("借款金額必須少於 HK$2,000");
      return;
    }

    const confirmations: string[] = [];
    for (const warning of WARNINGS) {
      const answer = window.prompt(`${warning}\n\n請輸入「我同意」繼續借款`);
      if (answer?.trim() !== "我同意") {
        toast.error("未完成三次確認，借款取消");
        return;
      }
      confirmations.push(answer);
    }

    startTransition(async () => {
      const result = await borrowMoney(loanAmount, confirmations);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `成功借入 ${formatCurrency(result.amount ?? 0)}，現時餘額 ${formatCurrency(result.newBalance ?? 0)}`
      );
      window.location.reload();
    });
  };

  const handleRepay = () => {
    const payment = Number(repaymentAmount);
    if (!Number.isFinite(payment) || payment <= 0) {
      toast.error("還款金額必須大於 HK$0");
      return;
    }

    if (payment > totalBorrowed) {
      toast.error("還款金額不可多於欠款");
      return;
    }

    startTransition(async () => {
      const result = await repayMoney(payment);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `成功還款 ${formatCurrency(result.amount ?? 0)}，尚欠 ${formatCurrency(
          result.totalOwed ?? 0
        )}`
      );
      window.location.reload();
    });
  };

  return (
    <div className="card p-4 space-y-3 border-orange-500/30">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">借錢搏一搏</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            尚欠：{formatCurrency(totalBorrowed)}
          </p>
        </div>
        <span className="text-xs text-orange-400">借款會從龍虎榜資產扣除</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-slate-900/70 px-3 py-2">
          <p className="text-slate-500">本金</p>
          <p className="font-semibold text-white">{formatCurrency(loanPrincipal)}</p>
        </div>
        <div className="rounded-lg bg-slate-900/70 px-3 py-2">
          <p className="text-slate-500">利息</p>
          <p className="font-semibold text-white">{formatCurrency(loanInterest)}</p>
        </div>
        <div className="rounded-lg bg-slate-900/70 px-3 py-2">
          <p className="text-slate-500">週利率</p>
          <p className="font-semibold text-white">
            {(effectiveWeeklyRate * 100).toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          max="1999.99"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="form-input flex-1"
          aria-label="借款金額"
        />
        <button
          type="button"
          onClick={handleBorrow}
          disabled={pending}
          className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl px-5 text-sm font-semibold"
        >
          {pending ? "借緊…" : "借錢"}
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          min="0.01"
          max={Math.max(totalBorrowed, 0.01)}
          step="0.01"
          value={repaymentAmount}
          onChange={(event) => setRepaymentAmount(event.target.value)}
          className="form-input flex-1"
          aria-label="還款金額"
          disabled={totalBorrowed <= 0}
        />
        <button
          type="button"
          onClick={handleRepay}
          disabled={pending || totalBorrowed <= 0}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl px-5 text-sm font-semibold"
        >
          {pending ? "處理中…" : "還錢"}
        </button>
      </div>
    </div>
  );
}
