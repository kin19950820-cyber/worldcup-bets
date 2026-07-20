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

// Default view: the most recently ended season, else the latest season.
export function getDefaultSeason(): Season {
  const ended = SEASONS.filter((season) => season.ended);
  return ended.length > 0 ? ended[ended.length - 1] : SEASONS[SEASONS.length - 1];
}

export function seasonWindow(season: Season) {
  return {
    startMs: new Date(season.start).getTime(),
    endMs: season.end ? new Date(season.end).getTime() : Number.POSITIVE_INFINITY,
    endDate: season.end ? new Date(season.end) : new Date(),
  };
}
