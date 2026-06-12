import { getAllMatches } from "@/lib/actions/matches";
import { formatHKTime, getMatchStatusLabel, cn } from "@/lib/utils";
import MatchCountdown from "@/components/matches/MatchCountdown";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const { matches } = await getAllMatches();

  const upcoming = matches.filter((m) =>
    ["SCHEDULED", "TIMED"].includes(m.status) && new Date(m.kickoff_time) > new Date()
  );
  const live = matches.filter((m) => ["IN_PLAY", "PAUSED"].includes(m.status));
  const finished = matches.filter((m) =>
    ["FINISHED", "POSTPONED", "CANCELLED"].includes(m.status)
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        ⚽ 賽程一覽
      </h1>

      {live.length > 0 && (
        <Section title="🔴 比賽中" matches={live} showScore />
      )}
      {upcoming.length > 0 && (
        <Section title="📅 即將開賽" matches={upcoming} showCountdown />
      )}
      {finished.length > 0 && (
        <Section title="✅ 已完場" matches={finished} showScore />
      )}

      {matches.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <div className="text-5xl mb-4">📅</div>
          <p className="font-medium">暫無賽程</p>
          <p className="text-sm mt-1">請管理員同步賽事資料</p>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  matches,
  showScore,
  showCountdown,
}: {
  title: string;
  matches: {
    id: string;
    home_team: string;
    away_team: string;
    kickoff_time: string;
    stage: string | null;
    group_name: string | null;
    status: string;
    score_home: number | null;
    score_away: number | null;
  }[];
  showScore?: boolean;
  showCountdown?: boolean;
}) {
  return (
    <div>
      <h2 className="text-slate-300 font-semibold mb-3">{title}</h2>
      <div className="space-y-2">
        {matches.map((m) => (
          <div key={m.id} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">
                {m.group_name ?? m.stage ?? ""}
              </span>
              {showCountdown && <MatchCountdown kickoffTime={m.kickoff_time} />}
              {!showCountdown && (
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    m.status === "IN_PLAY" || m.status === "PAUSED"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-slate-700 text-slate-400"
                  )}
                >
                  {getMatchStatusLabel(m.status)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="flex-1 text-right font-semibold text-sm text-white">
                {m.home_team}
              </span>
              {showScore && m.score_home !== null && m.score_away !== null ? (
                <span className="text-white font-bold text-lg font-mono bg-slate-800 px-3 py-1 rounded-lg">
                  {m.score_home} – {m.score_away}
                </span>
              ) : (
                <span className="text-slate-600 text-sm font-mono">vs</span>
              )}
              <span className="flex-1 text-left font-semibold text-sm text-white">
                {m.away_team}
              </span>
            </div>

            <p className="text-center text-xs text-slate-500 mt-2">
              {formatHKTime(m.kickoff_time, "yyyy年MM月dd日 HH:mm")} HKT
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
