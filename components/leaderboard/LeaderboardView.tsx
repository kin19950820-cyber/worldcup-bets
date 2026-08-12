"use client";

import { useState } from "react";
import type { LeaderboardEntry } from "@/lib/types";
import type { MyGroup } from "@/lib/actions/groups";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import StreakHighlights from "@/components/leaderboard/StreakHighlights";
import GroupPanel from "@/components/leaderboard/GroupPanel";

type Scope = "active" | "all";

export default function LeaderboardView({
  entries,
  myGroup,
  isActiveSeason = true,
}: {
  entries: LeaderboardEntry[];
  myGroup: MyGroup | null;
  isActiveSeason?: boolean;
}) {
  // A completed season has no "recent activity", so show everyone by default.
  const [scope, setScope] = useState<Scope>(isActiveSeason ? "active" : "all");
  const [groupId, setGroupId] = useState<string>(myGroup?.id ?? "all");

  const groupOptions = Array.from(
    new Map(
      entries
        .filter((entry): entry is LeaderboardEntry & { group_id: string; group_name: string } =>
          entry.group_id !== null && entry.group_name !== null
        )
        .map((entry) => [entry.group_id, entry.group_name])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const scoped =
    groupId === "all" ? entries : entries.filter((entry) => entry.group_id === groupId);
  const visible =
    scope === "active" ? scoped.filter((entry) => entry.is_active) : scoped;
  const hiddenCount = scoped.length - visible.length;

  return (
    <div className="space-y-4">
      <GroupPanel myGroup={myGroup} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isActiveSeason && (
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
          </div>
        )}

        {groupOptions.length > 0 && (
          <div>
            <label className="form-label">群組</label>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className="form-input appearance-none"
            >
              <option value="all">全部玩家（不分組）</option>
              {groupOptions.map(([id, groupName]) => (
                <option key={id} value={id}>
                  {groupName}
                  {myGroup?.id === id ? "（我的群組）" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {scope === "active" && hiddenCount > 0 && (
        <p className="text-xs text-slate-600">
          已隱藏 {hiddenCount} 位非現役玩家
        </p>
      )}

      <StreakHighlights entries={visible} />
      <LeaderboardTable entries={visible} />
    </div>
  );
}
