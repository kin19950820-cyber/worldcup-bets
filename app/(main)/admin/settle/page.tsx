import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllBetsForAdmin } from "@/lib/actions/settle";
import { resolveViewSeasonId, getSeason } from "@/lib/seasons";
import SeasonChips from "@/components/season/SeasonChips";
import SettlePanel from "@/components/admin/SettlePanel";

export const dynamic = "force-dynamic";

export default async function AdminSettlePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const seasonId = resolveViewSeasonId(params.season);
  const season = getSeason(seasonId);
  const { bets } = await getAllBetsForAdmin("all", seasonId);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
        ⚖️ 投注結算
      </h1>
      <p className="text-slate-400 text-sm mb-4">
        管理員專用 — 處理或修正投注結算
      </p>

      <SeasonChips basePath="/admin/settle" seasonId={seasonId} />

      {season?.ended && (
        <p className="mb-4 rounded-lg bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
          此季度已完結；歷史結算僅供查閱。
        </p>
      )}

      <SettlePanel initialBets={bets} />
    </div>
  );
}
