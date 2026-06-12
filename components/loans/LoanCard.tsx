"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { borrowMoney } from "@/lib/actions/loans";
import { formatCurrency } from "@/lib/utils";

const WARNINGS = [
  "搏一搏單車變摩托",
  "我認我係燈神",
  "今鋪仲唔一鋪返身",
];

export default function LoanCard({ totalBorrowed }: { totalBorrowed: number }) {
  const [amount, setAmount] = useState("500");
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

  return (
    <div className="card p-4 space-y-3 border-orange-500/30">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">借錢搏一搏</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            累計借款：{formatCurrency(totalBorrowed)}
          </p>
        </div>
        <span className="text-xs text-orange-400">借款會從龍虎榜資產扣除</span>
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
    </div>
  );
}
