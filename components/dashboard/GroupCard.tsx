"use client";

import Link from "next/link";
import toast from "react-hot-toast";
import type { MyGroup } from "@/lib/actions/groups";

export default function GroupCard({ myGroups }: { myGroups: MyGroup[] }) {
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("已複製邀請代碼");
    } catch {
      toast.error("複製失敗，請手動選取代碼");
    }
  };

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">我的群組（{myGroups.length}）</p>
        <Link
          href="/leaderboard"
          className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          管理
        </Link>
      </div>
      {myGroups.map((group) => (
        <div key={group.id} className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate font-semibold text-white">
            👥 {group.name}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-sm font-semibold text-brand-400">
              {group.code}
            </span>
            <button
              type="button"
              onClick={() => copyCode(group.code)}
              className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              📋 複製
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
