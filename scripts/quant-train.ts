// Trains the quant model from the open international results dataset
// (github.com/martj42/international_results) and writes versioned artifacts
// into lib/quant/data/:
//
//   ratings.json  - final Elo rating per national team
//   params.json   - Poisson GLM coefficients + Dixon-Coles rho
//   backtest.json - walk-forward evaluation metrics
//
// Run with: npm run quant:train  (uses npx tsx; no runtime dependency)

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ELO_INITIAL, eloUpdate } from "../lib/quant/elo";
import {
  dixonColesTau,
  fitPoissonGlm,
  outcomeProbabilities,
  poissonPmf,
  scoreMatrix,
} from "../lib/quant/math";
import { HISTORICAL_MERGES } from "../lib/quant/teams";

const DATA_URL =
  "https://raw.githubusercontent.com/martj42/international_results/master/results.csv";
const GLM_TRAIN_START = "1990-01-01";
const EVAL_START = "2018-01-01";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(scriptDir, "..", "lib", "quant", "data");

type MatchRow = {
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  tournament: string;
  neutral: boolean;
};

type PredictionRecord = {
  date: string;
  eloDiff: number; // (pre-match home Elo - away Elo) / 400
  nonNeutral: number; // 1 when true home fixture
  homeScore: number;
  awayScore: number;
};

async function loadRows(): Promise<MatchRow[]> {
  const cachePath = join(scriptDir, ".cache-results.csv");
  let csv: string;
  if (existsSync(cachePath)) {
    csv = readFileSync(cachePath, "utf8");
    console.log("using cached dataset:", cachePath);
  } else {
    console.log("downloading dataset ...");
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`dataset download failed: ${res.status}`);
    csv = await res.text();
    writeFileSync(cachePath, csv);
  }

  const lines = csv.trim().split("\n");
  const rows: MatchRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    if (cols.length < 9) continue;
    const [date, home, away, hs, as, tournament, , , neutral] = cols;
    const homeScore = Number(hs);
    const awayScore = Number(as);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
    rows.push({
      date,
      home: HISTORICAL_MERGES[home] ?? home,
      away: HISTORICAL_MERGES[away] ?? away,
      homeScore,
      awayScore,
      tournament,
      neutral: neutral.trim().toUpperCase() === "TRUE",
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

function runEloPass(rows: MatchRow[]) {
  const ratings = new Map<string, number>();
  const matchCounts = new Map<string, number>();
  const records: PredictionRecord[] = [];

  for (const row of rows) {
    const homeRating = ratings.get(row.home) ?? ELO_INITIAL;
    const awayRating = ratings.get(row.away) ?? ELO_INITIAL;

    records.push({
      date: row.date,
      eloDiff: (homeRating - awayRating) / 400,
      nonNeutral: row.neutral ? 0 : 1,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
    });

    const updated = eloUpdate(
      homeRating,
      awayRating,
      row.homeScore,
      row.awayScore,
      row.tournament,
      row.neutral
    );
    ratings.set(row.home, updated.home);
    ratings.set(row.away, updated.away);
    matchCounts.set(row.home, (matchCounts.get(row.home) ?? 0) + 1);
    matchCounts.set(row.away, (matchCounts.get(row.away) ?? 0) + 1);
  }

  return { ratings, matchCounts, records };
}

function lambdas(
  record: Pick<PredictionRecord, "eloDiff" | "nonNeutral">,
  homeBeta: number[],
  awayBeta: number[]
) {
  const clamp = (eta: number) => Math.exp(Math.min(1.8, Math.max(-2.5, eta)));
  return {
    home: clamp(
      homeBeta[0] + homeBeta[1] * record.eloDiff + homeBeta[2] * record.nonNeutral
    ),
    away: clamp(
      awayBeta[0] - awayBeta[1] * record.eloDiff + awayBeta[2] * record.nonNeutral
    ),
  };
}

function fitRho(
  train: PredictionRecord[],
  homeBeta: number[],
  awayBeta: number[]
) {
  let bestRho = 0;
  let bestLogLik = -Infinity;
  for (let rho = -0.15; rho <= 0.1501; rho += 0.005) {
    let logLik = 0;
    for (const record of train) {
      const { home, away } = lambdas(record, homeBeta, awayBeta);
      const tau = Math.max(
        1e-6,
        dixonColesTau(record.homeScore, record.awayScore, home, away, rho)
      );
      const p =
        tau *
        poissonPmf(Math.min(10, record.homeScore), home) *
        poissonPmf(Math.min(10, record.awayScore), away);
      logLik += Math.log(Math.max(1e-12, p));
    }
    if (logLik > bestLogLik) {
      bestLogLik = logLik;
      bestRho = rho;
    }
  }
  return Number(bestRho.toFixed(3));
}

function evaluate(
  evalRecords: PredictionRecord[],
  homeBeta: number[],
  awayBeta: number[],
  rho: number,
  baseRates: { home: number; draw: number; away: number }
) {
  let brierModel = 0;
  let brierBase = 0;
  let logLossModel = 0;
  let logLossBase = 0;
  let correct = 0;
  const bins = Array.from({ length: 10 }, () => ({
    predicted: 0,
    actual: 0,
    count: 0,
  }));

  for (const record of evalRecords) {
    const { home, away } = lambdas(record, homeBeta, awayBeta);
    const probs = outcomeProbabilities(scoreMatrix(home, away, rho));
    const outcome =
      record.homeScore > record.awayScore
        ? "home"
        : record.homeScore === record.awayScore
        ? "draw"
        : "away";

    for (const key of ["home", "draw", "away"] as const) {
      const y = outcome === key ? 1 : 0;
      brierModel += (probs[key] - y) ** 2;
      brierBase += (baseRates[key] - y) ** 2;
    }
    logLossModel += -Math.log(Math.max(1e-12, probs[outcome]));
    logLossBase += -Math.log(Math.max(1e-12, baseRates[outcome]));

    const pick =
      probs.home >= probs.draw && probs.home >= probs.away
        ? "home"
        : probs.draw >= probs.away
        ? "draw"
        : "away";
    if (pick === outcome) correct += 1;

    const bin = Math.min(9, Math.floor(probs.home * 10));
    bins[bin].predicted += probs.home;
    bins[bin].actual += outcome === "home" ? 1 : 0;
    bins[bin].count += 1;
  }

  const n = evalRecords.length;
  return {
    matches: n,
    brier: { model: brierModel / n, baseline: brierBase / n },
    logLoss: { model: logLossModel / n, baseline: logLossBase / n },
    accuracy: correct / n,
    calibration: bins.map((bin, index) => ({
      bucket: `${index * 10}-${index * 10 + 10}%`,
      meanPredicted: bin.count ? bin.predicted / bin.count : 0,
      actualRate: bin.count ? bin.actual / bin.count : 0,
      count: bin.count,
    })),
  };
}

async function main() {
  const rows = await loadRows();
  console.log(`parsed ${rows.length} completed matches`);

  const { ratings, matchCounts, records } = runEloPass(rows);

  const train = records.filter(
    (record) => record.date >= GLM_TRAIN_START && record.date < EVAL_START
  );
  const evalRecords = records.filter((record) => record.date >= EVAL_START);
  console.log(`GLM train: ${train.length}, eval: ${evalRecords.length}`);

  const design = train.map((record) => [
    1,
    record.eloDiff,
    record.nonNeutral,
  ]);
  const homeBeta = fitPoissonGlm(
    design,
    train.map((record) => record.homeScore)
  );
  const awayBeta = fitPoissonGlm(
    train.map((record) => [1, -record.eloDiff, record.nonNeutral]),
    train.map((record) => record.awayScore)
  );
  console.log("homeBeta", homeBeta.map((b) => b.toFixed(4)));
  console.log("awayBeta", awayBeta.map((b) => b.toFixed(4)));

  const rho = fitRho(train, homeBeta, awayBeta);
  console.log("rho", rho);

  let homeWins = 0;
  let draws = 0;
  for (const record of train) {
    if (record.homeScore > record.awayScore) homeWins += 1;
    else if (record.homeScore === record.awayScore) draws += 1;
  }
  const baseRates = {
    home: homeWins / train.length,
    draw: draws / train.length,
    away: 1 - homeWins / train.length - draws / train.length,
  };

  const backtest = evaluate(evalRecords, homeBeta, awayBeta, rho, baseRates);
  console.log("backtest", JSON.stringify(backtest.brier), JSON.stringify(backtest.logLoss), "acc", backtest.accuracy.toFixed(4));

  mkdirSync(outDir, { recursive: true });

  const ratingsOut: Record<string, { rating: number; matches: number }> = {};
  for (const [team, rating] of [...ratings.entries()].sort()) {
    ratingsOut[team] = {
      rating: Number(rating.toFixed(1)),
      matches: matchCounts.get(team) ?? 0,
    };
  }
  writeFileSync(
    join(outDir, "ratings.json"),
    JSON.stringify(
      {
        trainedAt: new Date().toISOString(),
        source: DATA_URL,
        totalMatches: rows.length,
        lastMatchDate: rows[rows.length - 1]?.date ?? null,
        teams: ratingsOut,
      },
      null,
      2
    )
  );
  writeFileSync(
    join(outDir, "params.json"),
    JSON.stringify(
      {
        trainedAt: new Date().toISOString(),
        glmTrainWindow: [GLM_TRAIN_START, EVAL_START],
        homeBeta,
        awayBeta,
        rho,
        baseRates,
      },
      null,
      2
    )
  );
  writeFileSync(
    join(outDir, "backtest.json"),
    JSON.stringify(
      { evaluatedAt: new Date().toISOString(), evalStart: EVAL_START, ...backtest },
      null,
      2
    )
  );
  console.log("artifacts written to", outDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
