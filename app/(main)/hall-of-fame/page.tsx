import Link from "next/link";
import { redirect } from "next/navigation";
import { getHallOfFame } from "@/lib/actions/hall-of-fame";
import { getDefaultSeason, SEASONS } from "@/lib/seasons";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HallOfFamePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const params = await searchParams;
  const requestedId = Number(params.season);
  const seasonId = SEASONS.some((season) => season.id === requestedId)
    ? requestedId
    : getDefaultSeason().id;

  const result = await getHallOfFame(seasonId);
  if ("error" in result) {
    if (result.error === "未登入") redirect("/login");
    redirect("/hall-of-fame");
  }

  const { season, participantCount, totalBets, awards } = result;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          🏛️ 名人堂
        </h1>
        <p className="text-slate-400 text-sm mt-1">每季獎項得主，永留青史</p>
      </div>

      {/* Season picker */}
      <div className="flex flex-wrap gap-2">
        {SEASONS.map((item) => (
          <Link
            key={item.id}
            href={`/hall-of-fame?season=${item.id}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              item.id === season.id
                ? "border-brand-500/50 bg-brand-500/15 text-white"
                : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white"
            )}
          >
            {item.name}
            <span
              className={cn(
                "ml-2 rounded-full px-1.5 py-0.5 text-[10px]",
                item.ended
                  ? "bg-slate-700 text-slate-300"
                  : "bg-emerald-500/20 text-emerald-300"
              )}
            >
              {item.ended ? "已完結" : "進行中"}
            </span>
          </Link>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        {season.name} · {participantCount} 位玩家 · {totalBets} 注
        {!season.ended && "（進行中，結果會隨投注變動）"}
      </p>

      {awards.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <div className="text-4xl mb-3">🏛️</div>
          <p>本季暫無投注記錄</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {awards.map((award) => (
            <div key={award.key} className="card p-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{award.icon}</span>
                <div>
                  <p className="font-semibold text-white">{award.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {award.description}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {award.winners.map((winner) => (
                  <div
                    key={`${award.key}-${winner.name}`}
                    className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-800/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {winner.name}
                      </p>
                      {winner.detail && (
                        <p className="text-[11px] text-slate-500">
                          {winner.detail}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 font-bold text-brand-400">
                      {winner.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
