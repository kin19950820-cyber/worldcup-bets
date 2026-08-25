"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getActiveSeason } from "@/lib/seasons";
import { analyzeFixture } from "@/lib/quant/model";

export type ModelScorecard = {
  total: number; // finished matches the model could analyse
  hits: number; // most-likely outcome matched the actual result
  accuracy: number;
  brier: number; // mean 3-way Brier score (lower is better)
  baselineHits: number; // naive "home always wins" hits, for context
};

type Outcome = "home" | "draw" | "away";

function argmaxOutcome(p: { home: number; draw: number; away: number }): Outcome {
  if (p.home >= p.draw && p.home >= p.away) return "home";
  if (p.away >= p.draw && p.away >= p.home) return "away";
  return "draw";
}

// Reassess the model against reality: replay every finished match this season
// through the model and compare its top pick / probabilities to the actual
// score. This is live, out-of-sample evidence that updates as results land.
export async function getModelScorecard(): Promise<ModelScorecard> {
  const service = createServiceClient();
  const seasonId = getActiveSeason().id;

  const { data } = await service
    .from("matches")
    .select("home_team, away_team, stage, status, score_home, score_away")
    .eq("season_id", seasonId)
    .eq("status", "FINISHED");

  let total = 0;
  let hits = 0;
  let baselineHits = 0;
  let brierSum = 0;

  for (const m of data ?? []) {
    if (m.stage === "特別項目") continue;
    if (m.score_home == null || m.score_away == null) continue;

    const analysis = analyzeFixture(
      m.home_team,
      m.away_team,
      m.stage === "英超"
    );
    if (!analysis) continue;

    const actual: Outcome =
      m.score_home > m.score_away
        ? "home"
        : m.score_home < m.score_away
        ? "away"
        : "draw";

    const pick = argmaxOutcome(analysis.probabilities);
    total += 1;
    if (pick === actual) hits += 1;
    if (actual === "home") baselineHits += 1; // "home always" reference

    const y = {
      home: actual === "home" ? 1 : 0,
      draw: actual === "draw" ? 1 : 0,
      away: actual === "away" ? 1 : 0,
    };
    brierSum +=
      (analysis.probabilities.home - y.home) ** 2 +
      (analysis.probabilities.draw - y.draw) ** 2 +
      (analysis.probabilities.away - y.away) ** 2;
  }

  return {
    total,
    hits,
    accuracy: total > 0 ? hits / total : 0,
    brier: total > 0 ? brierSum / total : 0,
    baselineHits,
  };
}
