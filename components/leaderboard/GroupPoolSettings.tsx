"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { updateGroupSettings } from "@/lib/actions/groups";
import type { MyGroup } from "@/lib/actions/groups";
import { validatePrizePoolSettings } from "@/lib/prize-pool";

// Owner-only editor for a group's real-money prize pool: basic buy-in, extra
// (rebuy) buy-in, and the 冠/亞/季 split ratios. Collapsed by default.
export default function GroupPoolSettings({ group }: { group: MyGroup }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [buyin, setBuyin] = useState(String(group.buyin_amount));
  const [rebuy, setRebuy] = useState(String(group.rebuy_amount));
  const [first, setFirst] = useState(String(group.payout_first));
  const [second, setSecond] = useState(String(group.payout_second));
  const [third, setThird] = useState(String(group.payout_third));

  const save = () => {
    const settings = {
      buyinAmount: Number(buyin),
      rebuyAmount: Number(rebuy),
      payoutFirst: Number(first),
      payoutSecond: Number(second),
      payoutThird: Number(third),
    };
    const invalid = validatePrizePoolSettings(settings);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    startTransition(async () => {
      const result = await updateGroupSettings(group.id, settings);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("已更新彩池設定");
      setOpen(false);
      window.location.reload();
    });
  };

  const ratioSum = Number(first) + Number(second) + Number(third);

  return (
    <div className="mt-1.5 border-t border-slate-800/70 pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-medium text-amber-400 hover:text-amber-300"
      >
        {open ? "▾" : "▸"} 💰 彩池設定
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-400">
              基本買入（每人）
              <input
                type="number"
                min={0}
                value={buyin}
                onChange={(e) => setBuyin(e.target.value)}
                className="form-input mt-1 w-full py-1.5 text-sm"
              />
            </label>
            <label className="text-[11px] text-slate-400">
              額外買入（每次重買）
              <input
                type="number"
                min={0}
                value={rebuy}
                onChange={(e) => setRebuy(e.target.value)}
                className="form-input mt-1 w-full py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="text-[11px] text-slate-400">
            分獎比率（冠 / 亞 / 季，合計須為 100%）
            <div className="mt-1 grid grid-cols-3 gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                className="form-input w-full py-1.5 text-sm"
                aria-label="冠軍比率"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={second}
                onChange={(e) => setSecond(e.target.value)}
                className="form-input w-full py-1.5 text-sm"
                aria-label="亞軍比率"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={third}
                onChange={(e) => setThird(e.target.value)}
                className="form-input w-full py-1.5 text-sm"
                aria-label="季軍比率"
              />
            </div>
            <p
              className={`mt-1 text-[10px] ${
                ratioSum === 100 ? "text-slate-500" : "text-red-400"
              }`}
            >
              合計 {ratioSum}%
            </p>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="btn-primary w-full py-1.5 text-sm disabled:opacity-50"
          >
            儲存
          </button>
        </div>
      )}
    </div>
  );
}
