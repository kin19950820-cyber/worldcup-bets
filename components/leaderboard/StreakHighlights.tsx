import type { LeaderboardEntry } from "@/lib/types";

function pickLeader(
  entries: LeaderboardEntry[],
  select: (entry: LeaderboardEntry) => number
) {
  let leader: LeaderboardEntry | null = null;
  let best = 0;

  for (const entry of entries) {
    const value = select(entry);
    if (value > best) {
      best = value;
      leader = entry;
    }
  }

  return leader ? { name: leader.display_name, streak: best } : null;
}

function HighlightCard({
  icon,
  title,
  accent,
  leader,
  unit,
}: {
  icon: string;
  title: string;
  accent: string;
  leader: { name: string; streak: number } | null;
  unit: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="text-base">{icon}</span>
        <span>{title}</span>
      </div>
      {leader ? (
        <div className="mt-2">
          <p className="truncate text-lg font-bold text-white">{leader.name}</p>
          <p className={`text-sm font-semibold ${accent}`}>
            {leader.streak} {unit}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">暫無紀錄</p>
      )}
    </div>
  );
}

export default function StreakHighlights({
  entries,
}: {
  entries: LeaderboardEntry[];
}) {
  const winLeader = pickLeader(entries, (entry) => entry.longest_win_streak);
  const lossLeader = pickLeader(entries, (entry) => entry.longest_loss_streak);

  if (!winLeader && !lossLeader) return null;

  return (
    <div className="mb-6 grid grid-cols-2 gap-3">
      <HighlightCard
        icon="🔥"
        title="最長連勝王"
        accent="text-emerald-400"
        leader={winLeader}
        unit="連勝"
      />
      <HighlightCard
        icon="🥶"
        title="最長連敗王"
        accent="text-red-400"
        leader={lossLeader}
        unit="連敗"
      />
    </div>
  );
}
