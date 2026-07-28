import Link from "next/link";
import { getAllMatches } from "@/lib/actions/matches";
import { createClient } from "@/lib/supabase/server";
import { SEASONS, resolveViewSeasonId } from "@/lib/seasons";
import { cn } from "@/lib/utils";
import PublicBetsTable from "@/components/bets/PublicBetsTable";

export const dynamic = "force-dynamic";

export default async function BetsBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const params = await searchParams;
  const seasonId = resolveViewSeasonId(params.season);

  const [{ matches: allMatches }, supabase] = await Promise.all([
    getAllMatches(),
    createClient(),
  ]);
  const matches = allMatches.filter((m) => m.season_id === seasonId);

  const [{ data: profiles }, { data: bets }] = await Promise.all([
    supabase.from("profiles").select("id, display_name").order("display_name"),
    supabase
      .from("bets")
      .select(
        "*, profiles(display_name), matches(home_team, away_team, kickoff_time, stage)"
      )
      .eq("season_id", seasonId)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        📋 公開投注版
      </h1>

      <div className="flex flex-wrap gap-2 mb-6">
        {SEASONS.map((season) => (
          <Link
            key={season.id}
            href={`/bets-board?season=${season.id}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              season.id === seasonId
                ? "border-brand-500/50 bg-brand-500/15 text-white"
                : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white"
            )}
          >
            {season.name}
          </Link>
        ))}
      </div>

      <PublicBetsTable
        initialBets={bets ?? []}
        matches={matches}
        players={profiles ?? []}
      />
    </div>
  );
}
