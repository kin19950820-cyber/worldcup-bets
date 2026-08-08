import Link from "next/link";
import { getLeaderboard } from "@/lib/actions/leaderboard";
import { getMyGroup } from "@/lib/actions/groups";
import { SEASONS, resolveViewSeasonId, getSeason } from "@/lib/seasons";
import { cn } from "@/lib/utils";
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

      <div className="flex flex-wrap gap-2 mb-6">
        {SEASONS.map((item) => (
          <Link
            key={item.id}
            href={`/leaderboard?season=${item.id}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              item.id === seasonId
                ? "border-brand-500/50 bg-brand-500/15 text-white"
                : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white"
            )}
          >
            {item.name}
            {item.ended && (
              <span className="ml-2 rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                已完結
              </span>
            )}
          </Link>
        ))}
      </div>

      <LeaderboardView
        entries={entries}
        myGroup={myGroup}
        isActiveSeason={!season?.ended}
      />
    </div>
  );
}
