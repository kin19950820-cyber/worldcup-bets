"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { createGroup, joinGroup, leaveGroup } from "@/lib/actions/groups";
import type { MyGroup } from "@/lib/actions/groups";

export default function GroupPanel({ myGroup }: { myGroup: MyGroup | null }) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"create" | "join">("join");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createGroup(name);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("群組已建立");
      setName("");
      window.location.reload();
    });
  };

  const handleJoin = () => {
    startTransition(async () => {
      const result = await joinGroup(code);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("已加入群組");
      setCode("");
      window.location.reload();
    });
  };

  const handleLeave = () => {
    if (!window.confirm("確定要離開此群組？")) return;
    startTransition(async () => {
      await leaveGroup();
      toast.success("已離開群組");
      window.location.reload();
    });
  };

  if (myGroup) {
    return (
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">👥 {myGroup.name}</h2>
          <button
            type="button"
            onClick={handleLeave}
            disabled={pending}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            離開群組
          </button>
        </div>
        <p className="text-xs text-slate-500">
          邀請代碼：
          <span className="ml-1 font-mono font-semibold text-brand-400">
            {myGroup.code}
          </span>
        </p>
        <p className="text-xs text-slate-500">
          {myGroup.members.length} 位成員：
          {myGroup.members.map((m) => m.display_name).join("、")}
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">👥 群組</h2>
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
            className="form-input text-sm py-2 flex-1"
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={pending}
            className="btn-primary text-sm px-4 disabled:opacity-50"
          >
            加入
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="輸入群組名稱"
            className="form-input text-sm py-2 flex-1"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={pending}
            className="btn-primary text-sm px-4 disabled:opacity-50"
          >
            建立
          </button>
        </div>
      )}
      <p className="text-xs text-slate-500">
        建立或加入群組後，可在龍虎榜篩選只顯示同組玩家的排名。
      </p>
    </div>
  );
}
