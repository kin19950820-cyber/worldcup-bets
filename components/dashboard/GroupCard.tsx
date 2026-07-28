"use client";

import Link from "next/link";
import toast from "react-hot-toast";
import type { MyGroup } from "@/lib/actions/groups";

export default function GroupCard({ myGroup }: { myGroup: MyGroup }) {
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(myGroup.code);
      toast.success("已複製邀請代碼");
    } catch {
      toast.error("複製失敗，請手動選取代碼");
    }
  };

  return (
    <div className="card p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">我的群組</p>
        <p className="font-semibold text-white truncate">👥 {myGroup.name}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-sm font-semibold text-brand-400">
          {myGroup.code}
        </span>
        <button
          type="button"
          onClick={handleCopyCode}
          className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          📋 複製
        </button>
        <Link
          href="/leaderboard"
          className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          管理
        </Link>
      </div>
    </div>
  );
}
