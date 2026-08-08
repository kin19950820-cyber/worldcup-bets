import { getLeaderboard } from "@/lib/actions/leaderboard";
import { getMyGroup } from "@/lib/actions/groups";
import { resolveViewSeasonId, getSeason } from "@/lib/seasons";
import SeasonChips from "@/components/season/SeasonChips";
import LeaderboardView from "@/components/leaderboard/LeaderboardView";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const params = await searchParams;
  const seasonId = resolveViewSeasonId(params.season);
  const season = getSeason(seasonId);

  const [{ entries }, myGroup] = await Promise.all([
    getLeaderboard(seasonId),
    getMyGroup(),
  ]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        🏆 龍虎榜
      </h1>

      <SeasonChips basePath="/leaderboard" seasonId={seasonId} />

      <LeaderboardView
        entries={entries}
        myGroup={myGroup}
        isActiveSeason={!season?.ended}
      />
    </div>
  );
}
