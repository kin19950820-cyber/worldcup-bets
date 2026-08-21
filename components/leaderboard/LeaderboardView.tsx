"use client";

import { useState } from "react";
import type { LeaderboardEntry } from "@/lib/types";
import type { MyGroup, GroupSummary } from "@/lib/actions/groups";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import StreakHighlights from "@/components/leaderboard/StreakHighlights";
import GroupPanel from "@/components/leaderboard/GroupPanel";
import GroupOverview from "@/components/leaderboard/GroupOverview";

export default function LeaderboardView({
  entries,
  myGroups,
  allGroups = [],
}: {
  entries: LeaderboardEntry[];
  myGroups: MyGroup[];
  allGroups?: GroupSummary[];
}) {
  // Default to the viewer's first group when they belong to any.
  const [groupId, setGroupId] = useState<string>(myGroups[0]?.id ?? "all");
  const myGroupIds = new Set(myGroups.map((g) => g.id));

  // All players are shown (no activity filter — the EPL schedule is mostly
  // weekends, so a "recent activity" cut would hide everyone mid-week).
  const visible =
    groupId === "all"
      ? entries
      : entries.filter((entry) => entry.group_ids.includes(groupId));

  const selectedGroup =
    groupId === "all" ? null : allGroups.find((g) => g.id === groupId) ?? null;

  return (
    <div className="space-y-4">
      <GroupPanel myGroups={myGroups} />

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

      {selectedGroup && (
        <GroupOverview groupName={selectedGroup.name} members={visible} />
      )}

      <StreakHighlights entries={visible} />
      <LeaderboardTable entries={visible} />
    </div>
  );
}
