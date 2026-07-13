// Inference: turns two team names into a full probabilistic match analysis
// using the trained artifacts in lib/quant/data/.

import ratingsData from "@/lib/quant/data/ratings.json";
import paramsData from "@/lib/quant/data/params.json";
import backtestData from "@/lib/quant/data/backtest.json";
import { eloExpectedScore } from "@/lib/quant/elo";
import {
  marginDistribution,
  outcomeProbabilities,
  scoreMatrix,
  topScorelines,
  totalDistribution,
} from "@/lib/quant/math";
import { resolveDatasetTeam, WC_2026_HOSTS } from "@/lib/quant/teams";

export type MatchAnalysis = {
  homeTeam: string;
  awayTeam: string;
  homeRating: number;
  awayRating: number;
  homeMatches: number;
  awayMatches: number;
  neutralVenue: boolean;
  lambdaHome: number;
  lambdaAway: number;
  probabilities: { home: number; draw: number; away: number };
  expectedTotalGoals: number;
  topScores: Array<{ home: number; away: number; probability: number }>;
  eloExpectancy: number;
  modelAgreement: number; // 0..1: Elo win expectancy vs Dixon-Coles matrix
  confidence: "high" | "medium" | "low";
  marginDist: Array<[number, number]>;
  totalDist: Array<[number, number]>;
  matrix: number[][]; // exact P(home = h, away = a) score matrix
};

const ratingKeys = Object.keys(ratingsData.teams);
const teams = ratingsData.teams as Record<
  string,
  { rating: number; matches: number }
>;

function clampedLambda(eta: number) {
  // Same clamp as training (scripts/quant-train.ts) for consistency.
  return Math.exp(Math.min(1.8, Math.max(-2.5, eta)));
}

export function getModelMeta() {
  return {
    trainedAt: ratingsData.trainedAt,
    totalMatches: ratingsData.totalMatches,
    lastMatchDate: ratingsData.lastMatchDate,
    rho: paramsData.rho,
    backtest: {
      evalStart: backtestData.evalStart,
      matches: backtestData.matches,
      brier: backtestData.brier,
      logLoss: backtestData.logLoss,
      accuracy: backtestData.accuracy,
    },
  };
}

export function analyzeFixture(
  homeName: string,
  awayName: string
): MatchAnalysis | null {
  const homeKey = resolveDatasetTeam(homeName, ratingKeys);
  const awayKey = resolveDatasetTeam(awayName, ratingKeys);
  if (!homeKey || !awayKey) return null;

  const home = teams[homeKey];
  const away = teams[awayKey];
  const neutralVenue = !WC_2026_HOSTS.has(homeKey);
  const nonNeutral = neutralVenue ? 0 : 1;
  const eloDiff = (home.rating - away.rating) / 400;

  const { homeBeta, awayBeta, rho } = paramsData;
  const lambdaHome = clampedLambda(
    homeBeta[0] + homeBeta[1] * eloDiff + homeBeta[2] * nonNeutral
  );
  const lambdaAway = clampedLambda(
    awayBeta[0] - awayBeta[1] * eloDiff + awayBeta[2] * nonNeutral
  );

  const matrix = scoreMatrix(lambdaHome, lambdaAway, rho);
  const probabilities = outcomeProbabilities(matrix);
  const eloExpectancy = eloExpectedScore(
    home.rating,
    away.rating,
    neutralVenue
  );
  const matrixExpectancy =
    probabilities.home + 0.5 * probabilities.draw;
  const modelAgreement = Math.max(
    0,
    1 - 2 * Math.abs(eloExpectancy - matrixExpectancy)
  );

  const minMatches = Math.min(home.matches, away.matches);
  const confidence =
    minMatches >= 300 ? "high" : minMatches >= 100 ? "medium" : "low";

  return {
    homeTeam: homeKey,
    awayTeam: awayKey,
    homeRating: home.rating,
    awayRating: away.rating,
    homeMatches: home.matches,
    awayMatches: away.matches,
    neutralVenue,
    lambdaHome,
    lambdaAway,
    probabilities,
    expectedTotalGoals: lambdaHome + lambdaAway,
    topScores: topScorelines(matrix, 3),
    eloExpectancy,
    modelAgreement,
    confidence,
    marginDist: [...marginDistribution(matrix).entries()],
    totalDist: [...totalDistribution(matrix).entries()],
    matrix,
  };
}
