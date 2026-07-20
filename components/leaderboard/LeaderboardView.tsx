"use client";

import { useState } from "react";
import type { LeaderboardEntry } from "@/lib/types";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import StreakHighlights from "@/components/leaderboard/StreakHighlights";

type Scope = "active" | "all";

export default function LeaderboardView({
  entries,
}: {
  entries: LeaderboardEntry[];
}) {
  const [scope, setScope] = useState<Scope>("active");
  const visible =
    scope === "active" ? entries.filter((entry) => entry.is_active) : entries;
  const hiddenCount = entries.length - visible.length;

  return (
    <div className="space-y-4">
      <div>
        <label className="form-label">顯示玩家</label>
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value as Scope)}
          className="form-input appearance-none"
        >
          <option value="active">現役玩家（3 日內有投注）</option>
          <option value="all">全部玩家</option>
        </select>
        {scope === "active" && hiddenCount > 0 && (
          <p className="mt-1 text-xs text-slate-600">
            已隱藏 {hiddenCount} 位非現役玩家
          </p>
        )}
      </div>

      <StreakHighlights entries={visible} />
      <LeaderboardTable entries={visible} />
    </div>
  );
}
