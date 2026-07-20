import { getLeaderboard } from "@/lib/actions/leaderboard";
import LeaderboardView from "@/components/leaderboard/LeaderboardView";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const { entries } = await getLeaderboard();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        🏆 龍虎榜
      </h1>
      <LeaderboardView entries={entries} />
    </div>
  );
}
