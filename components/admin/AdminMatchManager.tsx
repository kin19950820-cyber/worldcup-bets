"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  syncMatches,
  syncSpecialMarkets,
  addMatchManually,
  getAllMatches,
} from "@/lib/actions/matches";
import { isMatchClosed } from "@/lib/match-status";
import { formatHKTime, getMatchStatusLabel, cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Match } from "@/lib/types";

interface Props {
  initialMatches: Match[];
}

const AUTO_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const STALE_COMPLETED_MS = 2 * 24 * 60 * 60 * 1000;

export default function AdminMatchManager({ initialMatches }: Props) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [syncing, startSync] = useTransition();
  const [syncingSpecial, startSpecial] = useTransition();
  const [adding, startAdd] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const runningRef = useRef(false);

  const refreshList = useCallback(async () => {
    const { matches: latest } = await getAllMatches();
    if (latest) setMatches(latest);
  }, []);

  // Re-sync from the API and refresh the list. `silent` skips toasts for the
  // background auto-refresh; `runningRef` prevents overlapping runs.
  const runSync = useCallback(
    async ({ silent }: { silent?: boolean } = {}) => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const res = await syncMatches();
        if ("error" in res && res.error) {
          if (!silent) toast.error(res.error, { id: "sync" });
        } else if ("success" in res) {
          if (!silent) {
            toast.success(
              `同步完成！更新 ${res.synced} 場賽事${
                res.failed ? `，${res.failed} 場失敗` : ""
              }`,
              { id: "sync", duration: 5000 }
            );
          }
          await refreshList();
          setLastSyncAt(new Date());
        }
      } finally {
        runningRef.current = false;
      }
    },
    [refreshList]
  );

  const handleSync = () => {
    startSync(async () => {
      toast.loading("同步中…", { id: "sync" });
      await runSync();
    });
  };

  const handleSyncSpecial = () => {
    startSpecial(async () => {
      toast.loading("同步特別項目中…", { id: "special" });
      const res = await syncSpecialMarkets();
      if ("error" in res && res.error) {
        toast.error(res.error, { id: "special" });
      } else if ("success" in res) {
        toast.success(`特別項目同步完成！共 ${res.synced} 個項目`, {
          id: "special",
          duration: 5000,
        });
        await refreshList();
      }
    });
  };

  useEffect(() => {
    if (!autoRefresh) return;
    void runSync({ silent: true });
    const id = setInterval(() => void runSync({ silent: true }), AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, runSync]);

  const handleAddMatch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startAdd(async () => {
      const res = await addMatchManually(fd);
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        toast.success("賽事已新增！");
        setShowAddForm(false);
        await refreshList();
      }
    });
  };

  const upcoming = matches.filter((m) =>
    ["SCHEDULED", "TIMED"].includes(m.status) && new Date(m.kickoff_time) > new Date()
  );
  const others = matches.filter(
    (m) => !["SCHEDULED", "TIMED"].includes(m.status) || new Date(m.kickoff_time) <= new Date()
  );

  // Hide matches finished/completed more than 2 days ago to keep the list tidy.
  const now = Date.now();
  const visibleMatches = matches.filter((m) => {
    const kickoff = new Date(m.kickoff_time).getTime();
    const completed = isMatchClosed(m.status) || kickoff <= now;
    return !(completed && kickoff < now - STALE_COMPLETED_MS);
  });
  const hiddenCount = matches.length - visibleMatches.length;

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn-primary flex-1"
        >
          {syncing ? "同步中…" : "🔄 從 API 同步賽程"}
        </button>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-secondary px-4"
        >
          ➕
        </button>
      </div>

      <button
        onClick={handleSyncSpecial}
        disabled={syncingSpecial}
        className="btn-secondary w-full"
      >
        {syncingSpecial ? "同步特別項目中…" : "🏆 同步特別項目（冠軍 / 神射手）"}
      </button>

      {/* Auto refresh */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            自動更新（每 2 分鐘）
          </label>
          <p className="mt-1 text-xs text-slate-500">
            {autoRefresh
              ? "已開啟，會在此頁背景自動同步 API"
              : "開啟後會定時自動同步賽程"}
          </p>
        </div>
        <span className="shrink-0 text-xs text-slate-500">
          {lastSyncAt
            ? `上次更新 ${formatHKTime(lastSyncAt.toISOString(), "HH:mm:ss")}`
            : "尚未更新"}
        </span>
      </div>

      {/* Manual add form */}
      {showAddForm && (
        <form onSubmit={handleAddMatch} className="card p-4 space-y-4">
          <h3 className="font-semibold text-white">手動新增賽事</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">主隊</label>
              <input name="home_team" required placeholder="主隊名稱" className="form-input" />
            </div>
            <div>
              <label className="form-label">客隊</label>
              <input name="away_team" required placeholder="客隊名稱" className="form-input" />
            </div>
          </div>
          <div>
            <label className="form-label">開賽時間（HK 時間）</label>
            <input
              name="kickoff_time"
              type="datetime-local"
              required
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">階段（可選）</label>
            <input name="stage" placeholder="例：Group Stage / Round of 16" className="form-input" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={adding} className="btn-primary flex-1">
              {adding ? "新增中…" : "新增賽事"}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary flex-1">
              取消
            </button>
          </div>
        </form>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-white">{matches.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">總賽事</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-brand-400">{upcoming.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">待開賽</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-slate-400">{others.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">其他</p>
        </div>
      </div>

      {/* Match list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-slate-400 text-sm font-medium">賽事列表</h3>
          {hiddenCount > 0 && (
            <span className="text-xs text-slate-600">
              已隱藏 {hiddenCount} 場 2 天前完成賽事
            </span>
          )}
        </div>
        {visibleMatches.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">
            <p>{matches.length === 0 ? "暫無賽事，請先同步 API" : "沒有近期賽事"}</p>
          </div>
        ) : (
          visibleMatches.map((m) => (
            <div key={m.id} className="card p-3 flex items-center gap-3">
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full shrink-0",
                  ["SCHEDULED", "TIMED"].includes(m.status)
                    ? "bg-brand-500/20 text-brand-400"
                    : m.status === "FINISHED"
                    ? "bg-slate-700 text-slate-400"
                    : "bg-red-500/20 text-red-400"
                )}
              >
                {getMatchStatusLabel(m.status)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">
                  {m.home_team} vs {m.away_team}
                </p>
                <p className="text-xs text-slate-500">
                  {formatHKTime(m.kickoff_time, "yyyy/MM/dd HH:mm")} HKT
                  {m.stage && ` · ${m.stage}`}
                </p>
              </div>
              {m.score_home !== null && m.score_away !== null && (
                <span className="text-white font-mono font-bold text-sm shrink-0">
                  {m.score_home}–{m.score_away}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
