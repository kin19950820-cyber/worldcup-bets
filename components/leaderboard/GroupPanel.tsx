"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { createGroup, joinGroup, leaveGroup } from "@/lib/actions/groups";
import type { MyGroup } from "@/lib/actions/groups";
import GroupPoolSettings from "@/components/leaderboard/GroupPoolSettings";

export default function GroupPanel({ myGroups }: { myGroups: MyGroup[] }) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"join" | "create">("join");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const run = (fn: () => Promise<{ error?: string }>, ok: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(ok);
      setName("");
      setCode("");
      window.location.reload();
    });
  };

  const copyCode = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("已複製邀請代碼");
    } catch {
      toast.error("複製失敗，請手動選取代碼");
    }
  };

  return (
    <div className="card p-4 space-y-4">
      {/* Joined groups */}
      {myGroups.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-white">👥 我的群組（{myGroups.length}）</h2>
          {myGroups.map((group) => (
            <div
              key={group.id}
              className="rounded-lg bg-slate-900/70 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-white">
                  {group.name}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-brand-400">
                    {group.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyCode(group.code)}
                    className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white"
                  >
                    📋
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`確定離開「${group.name}」？`)) {
                        run(() => leaveGroup(group.id), "已離開群組");
                      }
                    }}
                    disabled={pending}
                    className="text-[11px] text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    離開
                  </button>
                </div>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {group.members.length} 位成員：
                {group.members.map((m) => m.display_name).join("、")}
              </p>
              {group.is_owner && <GroupPoolSettings group={group} />}
            </div>
          ))}
        </div>
      )}

      {/* Create / join */}
      <div className="space-y-2 border-t border-slate-800 pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">加入 / 建立群組</h3>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("join")}
              className={`px-2 py-1 rounded-lg ${mode === "join" ? "bg-brand-500/20 text-brand-400" : "text-slate-500"}`}
            >
              加入
            </button>
            <button
              type="button"
              onClick={() => setMode("create")}
              className={`px-2 py-1 rounded-lg ${mode === "create" ? "bg-brand-500/20 text-brand-400" : "text-slate-500"}`}
            >
              建立
            </button>
          </div>
        </div>

        {mode === "join" ? (
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="輸入群組代碼"
              className="form-input text-sm py-2 flex-1 uppercase"
            />
            <button
              type="button"
              onClick={() => run(() => joinGroup(code), "已加入群組")}
              disabled={pending}
              className="btn-primary text-sm px-4 disabled:opacity-50"
            >
              加入
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="群組名稱"
              className="form-input text-sm py-2 w-full"
            />
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="自訂代碼（4–10 位英數）"
                className="form-input text-sm py-2 flex-1 uppercase"
              />
              <button
                type="button"
                onClick={() => run(() => createGroup(name, code), "群組已建立")}
                disabled={pending}
                className="btn-primary text-sm px-4 disabled:opacity-50"
              >
                建立
              </button>
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500">
          可加入多個群組；在上方「群組」選單揀選要顯示邊一組的排名。
        </p>
      </div>
    </div>
  );
}
