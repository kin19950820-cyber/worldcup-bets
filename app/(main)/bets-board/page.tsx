import { getAllMatches } from "@/lib/actions/matches";
import { createClient } from "@/lib/supabase/server";
import PublicBetsTable from "@/components/bets/PublicBetsTable";

export const dynamic = "force-dynamic";

export default async function BetsBoardPage() {
  const [{ matches }, supabase] = await Promise.all([
    getAllMatches(),
    createClient(),
  ]);

  const [{ data: profiles }, { data: bets }] = await Promise.all([
    supabase.from("profiles").select("id, display_name").order("display_name"),
    supabase
      .from("bets")
      .select(
        "*, profiles(display_name), matches(home_team, away_team, kickoff_time, stage)"
      )
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        📋 公開投注版
      </h1>
      <PublicBetsTable
        initialBets={bets ?? []}
        matches={matches}
        players={profiles ?? []}
      />
    </div>
  );
}
