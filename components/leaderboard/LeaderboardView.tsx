"use client";

import { useState } from "react";
import type { LeaderboardEntry } from "@/lib/types";
import type { MyGroup, GroupSummary } from "@/lib/actions/groups";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import StreakHighlights from "@/components/leaderboard/StreakHighlights";
import GroupPanel from "@/components/leaderboard/GroupPanel";
import GroupOverview from "@/components/leaderboard/GroupOverview";

type Scope = "active" | "all";

export default function LeaderboardView({
  entries,
  myGroups,
  allGroups = [],
}: {
  entries: LeaderboardEntry[];
  myGroups: MyGroup[];
  allGroups?: GroupSummary[];
}) {
  const [scope, setScope] = useState<Scope>("active");
  // Default to the viewer's first group when they belong to any.
  const [groupId, setGroupId] = useState<string>(myGroups[0]?.id ?? "all");
  const myGroupIds = new Set(myGroups.map((g) => g.id));

  // Only the viewer's own groups are selectable filters.
  const scoped =
    groupId === "all"
      ? entries
      : entries.filter((entry) => entry.group_ids.includes(groupId));
  const visible =
    scope === "active" ? scoped.filter((entry) => entry.is_active) : scoped;
  const hiddenCount = scoped.length - visible.length;

  const selectedGroup =
    groupId === "all" ? null : allGroups.find((g) => g.id === groupId) ?? null;

  return (
    <div className="space-y-4">
      <GroupPanel myGroups={myGroups} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

        {allGroups.length > 0 && (
          <div>
            <label className="form-label">群組</label>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className="form-input appearance-none"
            >
              <option value="all">全部玩家（不分組）</option>
              {allGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}（{group.member_count} 人）
                  {myGroupIds.has(group.id) ? " ★" : ""}
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

      {selectedGroup && (
        <GroupOverview groupName={selectedGroup.name} members={scoped} />
      )}

      <StreakHighlights entries={visible} />
      <LeaderboardTable entries={visible} />
    </div>
  );
}
