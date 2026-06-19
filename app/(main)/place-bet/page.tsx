import { getUpcomingMatches } from "@/lib/actions/matches";
import { getBetOptionsForMatches } from "@/lib/actions/odds";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BetForm from "@/components/bets/BetForm";

export const dynamic = "force-dynamic";

export default async function PlaceBetPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ matches }, profileRes] = await Promise.all([
    getUpcomingMatches(),
    supabase.from("profiles").select("current_balance").eq("id", user.id).single(),
  ]);
  const oddsOptionsByMatchId = await getBetOptionsForMatches(matches);

  const balance = profileRes.data?.current_balance ?? 0;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        ➕ 落注
      </h1>
      {matches.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          <div className="text-5xl mb-4">📅</div>
          <p className="font-medium">暫無可投注賽事</p>
          <p className="text-sm mt-1">等待下一場比賽開放投注</p>
        </div>
      ) : (
        <BetForm
          matches={matches}
          currentBalance={balance}
          oddsOptionsByMatchId={oddsOptionsByMatchId}
        />
      )}
    </div>
  );
}
