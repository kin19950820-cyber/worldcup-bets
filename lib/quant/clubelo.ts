// clubelo.com integration: a pan-European club-Elo model that covers virtually
// every European club match (domestic leagues + UEFA competitions and their
// qualifiers), which the app's own international/England models do not.
//
// clubelo's public Fixtures endpoint returns, for each upcoming match, a full
// goal-difference distribution and an exact-scoreline distribution. We turn
// that directly into the same MatchAnalysis shape the rest of /quant consumes,
// so European fixtures get the same probability / EV / Kelly treatment.
//
// Endpoint is HTTP-only (clubelo has no HTTPS); the response is a small CSV.

import { unstable_cache } from "next/cache";
import type { MatchAnalysis } from "@/lib/quant/model";
import { normalizeTeamName } from "@/lib/quant/teams";
import {
  marginDistribution,
  outcomeProbabilities,
  topScorelines,
  totalDistribution,
  type ScoreMatrix,
} from "@/lib/quant/math";

const CLUBELO_FIXTURES_URL = "http://api.clubelo.com/Fixtures";
const MAX_GOALS = 10;
const FIXTURE_WINDOW_DAYS = 8;

export type CluboFixture = {
  date: string;
  country: string;
  home: string;
  away: string;
  analysis: MatchAnalysis;
};

function parseGdKey(key: string): number | null {
  if (key === "GD<-5") return -6;
  if (key === "GD>5") return 6;
  const match = key.match(/^GD=(-?\d+)$/);
  return match ? Number(match[1]) : null;
}

function buildAnalysis(
  home: string,
  away: string,
  gd: Map<number, number>,
  matrix: ScoreMatrix
): MatchAnalysis {
  const probabilities = outcomeProbabilities(matrix);
  // Prefer the complete GD distribution for 1X2 / handicap (it keeps the
  // blow-out tails the truncated score matrix drops).
  let gdHome = 0;
  let gdDraw = 0;
  let gdAway = 0;
  for (const [margin, p] of gd) {
    if (margin > 0) gdHome += p;
    else if (margin === 0) gdDraw += p;
    else gdAway += p;
  }
  const gdTotal = gdHome + gdDraw + gdAway || 1;
  const outcome = {
    home: gdHome / gdTotal,
    draw: gdDraw / gdTotal,
    away: gdAway / gdTotal,
  };

  let lambdaHome = 0;
  let lambdaAway = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      lambdaHome += h * matrix[h][a];
      lambdaAway += a * matrix[h][a];
    }
  }

  const eloExpectancy = outcome.home + 0.5 * outcome.draw;
  const matrixExpectancy = probabilities.home + 0.5 * probabilities.draw;
  const modelAgreement = Math.max(
    0,
    1 - 2 * Math.abs(eloExpectancy - matrixExpectancy)
  );

  return {
    modelScope: "clubelo",
    homeTeam: home,
    awayTeam: away,
    homeRating: 0,
    awayRating: 0,
    homeMatches: 0,
    awayMatches: 0,
    neutralVenue: false,
    lambdaHome,
    lambdaAway,
    probabilities: outcome,
    expectedTotalGoals: lambdaHome + lambdaAway,
    topScores: topScorelines(matrix, 3),
    eloExpectancy,
    modelAgreement,
    confidence: "medium",
    marginDist: [...gd.entries()],
    totalDist: [...totalDistribution(matrix).entries()],
    matrix,
  };
}

async function fetchCluboFixturesUncached(): Promise<CluboFixture[]> {
  let text: string;
  try {
    const res = await fetch(CLUBELO_FIXTURES_URL, {
      headers: { "user-agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }

  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");

  const gdCols: Array<{ index: number; margin: number }> = [];
  const scoreCols: Array<{ index: number; home: number; away: number }> = [];
  header.forEach((name, index) => {
    if (name.startsWith("GD")) {
      const margin = parseGdKey(name);
      if (margin !== null) gdCols.push({ index, margin });
    } else if (name.startsWith("R:")) {
      const [h, a] = name.slice(2).split("-").map(Number);
      if (Number.isFinite(h) && Number.isFinite(a)) {
        scoreCols.push({ index, home: h, away: a });
      }
    }
  });

  const cutoff = new Date(Date.now() + FIXTURE_WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  const today = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const fixtures: CluboFixture[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const date = cols[0];
    if (!date || date < today || date > cutoff) continue;
    const home = cols[2];
    const away = cols[3];
    if (!home || !away) continue;

    const gd = new Map<number, number>();
    let gdSum = 0;
    for (const col of gdCols) {
      const p = Number(cols[col.index]) || 0;
      gd.set(col.margin, (gd.get(col.margin) ?? 0) + p);
      gdSum += p;
    }
    if (gdSum <= 0) continue;
    for (const [margin, p] of gd) gd.set(margin, p / gdSum);

    const matrix: ScoreMatrix = Array.from({ length: MAX_GOALS + 1 }, () =>
      new Array(MAX_GOALS + 1).fill(0)
    );
    let matrixSum = 0;
    for (const col of scoreCols) {
      if (col.home > MAX_GOALS || col.away > MAX_GOALS) continue;
      const p = Number(cols[col.index]) || 0;
      matrix[col.home][col.away] = p;
      matrixSum += p;
    }
    if (matrixSum <= 0) continue;
    for (let h = 0; h <= MAX_GOALS; h++) {
      for (let a = 0; a <= MAX_GOALS; a++) matrix[h][a] /= matrixSum;
    }

    fixtures.push({
      date,
      country: cols[1],
      home,
      away,
      analysis: buildAnalysis(home, away, gd, matrix),
    });
  }
  return fixtures;
}

export const fetchCluboFixtures = unstable_cache(
  fetchCluboFixturesUncached,
  ["clubelo-fixtures"],
  { revalidate: 3600 }
);

// Find the clubelo fixture matching a pair of team names (any order), using
// the same normalization as the rest of the quant model.
export function findCluboFixture(
  fixtures: CluboFixture[],
  home: string,
  away: string
): CluboFixture | null {
  const h = normalizeTeamName(home);
  const a = normalizeTeamName(away);
  const contains = (name: string, target: string) => {
    const n = normalizeTeamName(name);
    return n === target || n.includes(target) || target.includes(n);
  };
  return (
    fixtures.find(
      (f) => contains(f.home, h) && contains(f.away, a)
    ) ?? null
  );
}
