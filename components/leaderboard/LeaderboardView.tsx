"use client";

import { useState } from "react";
import type { LeaderboardEntry } from "@/lib/types";
import type { MyGroup } from "@/lib/actions/groups";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import StreakHighlights from "@/components/leaderboard/StreakHighlights";
import GroupPanel from "@/components/leaderboard/GroupPanel";
import GroupOverview from "@/components/leaderboard/GroupOverview";

export default function LeaderboardView({
  entries,
  myGroups,
}: {
  entries: LeaderboardEntry[];
  myGroups: MyGroup[];
}) {
  // Groups are private: you can only view/filter groups you've joined.
  const [groupId, setGroupId] = useState<string>(myGroups[0]?.id ?? "all");

  const visible =
    groupId === "all"
      ? entries
      : entries.filter((entry) => entry.group_ids.includes(groupId));

  const selectedGroup =
    groupId === "all" ? null : myGroups.find((g) => g.id === groupId) ?? null;

  return (
    <div className="space-y-4">
      <GroupPanel myGroups={myGroups} />

      {myGroups.length > 0 && (
        <div>
          <label className="form-label">群組</label>
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            className="form-input appearance-none"
          >
            <option value="all">全部玩家（不分組）</option>
            {myGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}（{group.members.length} 人）
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedGroup && (
        <GroupOverview group={selectedGroup} members={visible} />
      )}

      <StreakHighlights entries={visible} />
      <LeaderboardTable entries={visible} />
    </div>
  );
}
