// Season definitions. Seasons are code-defined (no DB migration needed):
// a bet belongs to the season whose window contains its placement time, and
// season-end wealth is read from the last transaction at or before `end`.
//
// To start a new season, append an entry here and set the previous one's
// `ended` flag. The `end` of a finished season includes a small buffer after
// the last match so late admin settlements still count into that season.

export type Season = {
  id: number;
  name: string;
  start: string; // inclusive, ISO
  end: string | null; // exclusive, ISO; null = ongoing
  ended: boolean;
};

export const SEASONS: Season[] = [
  {
    id: 1,
    name: "第一季 · 世界盃 2026",
    start: "2026-06-01T00:00:00+08:00",
    // Final played 2026-07-19; buffer to 07-23 so final settlements count.
    end: "2026-07-23T00:00:00+08:00",
    ended: true,
  },
  {
    id: 2,
    name: "第二季 · 英超 2026/27",
    start: "2026-07-23T00:00:00+08:00",
    end: null,
    ended: false,
  },
];

export function getSeason(id: number): Season | null {
  return SEASONS.find((season) => season.id === id) ?? null;
}

// The single active (not-yet-ended) season. This is the app's working season
// for all NEW matches, bets, transactions and loans.
export function getActiveSeason(): Season {
  return (
    SEASONS.find((season) => !season.ended) ?? SEASONS[SEASONS.length - 1]
  );
}

// Default view for season-scoped pages: always the ACTIVE season, never a
// completed one, so players land on the live season by default.
export function getDefaultSeason(): Season {
  return getActiveSeason();
}

// Which season a timestamp belongs to (by configured window). Used to backfill
// and tag historical rows; new rows are tagged with getActiveSeason().id.
export function seasonIdForDate(date: Date | string | number): number {
  const ms = new Date(date).getTime();
  for (const season of SEASONS) {
    const { startMs, endMs } = seasonWindow(season);
    if (ms >= startMs && ms < endMs) return season.id;
  }
  // Anything before the first season's start belongs to season 1 (legacy).
  return SEASONS[0].id;
}

// Resolve a requested season id (e.g. from a query param) to a valid one,
// defaulting to the active season.
export function resolveViewSeasonId(requested: unknown): number {
  const id = Number(requested);
  if (SEASONS.some((season) => season.id === id)) return id;
  return getActiveSeason().id;
}

export function seasonWindow(season: Season) {
  return {
    startMs: new Date(season.start).getTime(),
    endMs: season.end ? new Date(season.end).getTime() : Number.POSITIVE_INFINITY,
    endDate: season.end ? new Date(season.end) : new Date(),
  };
}
