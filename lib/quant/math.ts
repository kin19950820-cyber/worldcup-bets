// Core probability engine: Poisson goal model with Dixon-Coles low-score
// adjustment, full-time score matrix, market derivations (1X2 / totals /
// Asian handicap / correct score), bookmaker margin removal, expected value
// and Kelly staking.

export const MAX_GOALS = 10;

const FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];

export function poissonPmf(k: number, lambda: number) {
  if (k < 0 || k > MAX_GOALS) return 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / FACTORIAL[k];
}

// Dixon & Coles (1997) dependence adjustment for low scores.
export function dixonColesTau(
  h: number,
  a: number,
  lambdaHome: number,
  lambdaAway: number,
  rho: number
) {
  if (h === 0 && a === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (h === 0 && a === 1) return 1 + lambdaHome * rho;
  if (h === 1 && a === 0) return 1 + lambdaAway * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

export type ScoreMatrix = number[][];

export function scoreMatrix(
  lambdaHome: number,
  lambdaAway: number,
  rho: number
): ScoreMatrix {
  const matrix: ScoreMatrix = [];
  let total = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    matrix[h] = [];
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p =
        Math.max(0, dixonColesTau(h, a, lambdaHome, lambdaAway, rho)) *
        poissonPmf(h, lambdaHome) *
        poissonPmf(a, lambdaAway);
      matrix[h][a] = p;
      total += p;
    }
  }
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) matrix[h][a] /= total;
  }
  return matrix;
}

export function outcomeProbabilities(matrix: ScoreMatrix) {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      if (h > a) home += matrix[h][a];
      else if (h === a) draw += matrix[h][a];
      else away += matrix[h][a];
    }
  }
  return { home, draw, away };
}

// P(home goals - away goals = m) for m in [-MAX_GOALS, MAX_GOALS].
export function marginDistribution(matrix: ScoreMatrix) {
  const dist = new Map<number, number>();
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      dist.set(h - a, (dist.get(h - a) ?? 0) + matrix[h][a]);
    }
  }
  return dist;
}

// P(total goals = t).
export function totalDistribution(matrix: ScoreMatrix) {
  const dist = new Map<number, number>();
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      dist.set(h + a, (dist.get(h + a) ?? 0) + matrix[h][a]);
    }
  }
  return dist;
}

export function topScorelines(matrix: ScoreMatrix, count: number) {
  const scores: Array<{ home: number; away: number; probability: number }> =
    [];
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      scores.push({ home: h, away: a, probability: matrix[h][a] });
    }
  }
  return scores
    .sort((a, b) => b.probability - a.probability)
    .slice(0, count);
}

// ---------------------------------------------------------------------------
// Bet settlement expected values (per unit stake, profit basis).
// ---------------------------------------------------------------------------

// Single Asian handicap line for the backed side: profit multiplier of stake.
function ahSettle(adjustedMargin: number, odds: number) {
  if (adjustedMargin > 1e-9) return odds - 1;
  if (adjustedMargin < -1e-9) return -1;
  return 0; // push
}

// Asian handicap EV for a bet on HOME at `lines` (away bets: negate margins
// upstream). Split lines ("‑0.5/‑1") are two half-stake bets; quarter lines
// like ‑0.75 are expanded into their two halves.
export function asianHandicapEv(
  marginDist: Map<number, number>,
  lines: number[],
  odds: number
) {
  const halves = lines.flatMap((line) => {
    const quarter = Math.abs((line * 4) % 2) === 1;
    return quarter ? [line - 0.25, line + 0.25] : [line, line];
  });

  let ev = 0;
  let winProbability = 0;
  for (const [margin, p] of marginDist) {
    let profit = 0;
    for (const half of halves) profit += ahSettle(margin + half, odds) / halves.length;
    ev += p * profit;
    if (profit > 0) winProbability += p;
  }
  return { ev, winProbability };
}

// Over/under EV for `lines` (e.g. [2.5] or [2, 2.5]) on side over/under.
export function overUnderEv(
  totalDist: Map<number, number>,
  lines: number[],
  over: boolean,
  odds: number
) {
  const halves = lines.flatMap((line) => {
    const quarter = Math.abs((line * 4) % 2) === 1;
    return quarter ? [line - 0.25, line + 0.25] : [line, line];
  });

  let ev = 0;
  let winProbability = 0;
  for (const [total, p] of totalDist) {
    let profit = 0;
    for (const half of halves) {
      const diff = over ? total - half : half - total;
      profit += ahSettle(diff, odds) / halves.length;
    }
    ev += p * profit;
    if (profit > 0) winProbability += p;
  }
  return { ev, winProbability };
}

// ---------------------------------------------------------------------------
// Market probabilities, EV and staking.
// ---------------------------------------------------------------------------

export function impliedProbability(odds: number) {
  return odds > 1 ? 1 / odds : 0;
}

// Proportional (multiplicative) margin removal across a complete market.
export function removeMargin(oddsList: number[]): number[] {
  const implied = oddsList.map(impliedProbability);
  const overround = implied.reduce((sum, p) => sum + p, 0);
  if (overround <= 0) return implied;
  return implied.map((p) => p / overround);
}

export function expectedValue(probability: number, odds: number) {
  return probability * odds - 1;
}

// Kelly fraction for a simple win/lose bet.
export function kellyFraction(probability: number, odds: number) {
  if (odds <= 1) return 0;
  const b = odds - 1;
  const f = (probability * odds - 1) / b;
  return Math.max(0, f);
}

// ---------------------------------------------------------------------------
// Poisson regression (log link) via Newton-Raphson / IRLS.
// Fits log(lambda) = beta . x for small fixed-width design matrices.
// ---------------------------------------------------------------------------

function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / m[i][i]);
}

export function fitPoissonGlm(
  design: number[][],
  counts: number[],
  iterations = 25
): number[] {
  const p = design[0].length;
  let beta = new Array(p).fill(0);
  beta[0] = Math.log(
    Math.max(1e-6, counts.reduce((s, y) => s + y, 0) / counts.length)
  );

  for (let iter = 0; iter < iterations; iter++) {
    const gradient = new Array(p).fill(0);
    const hessian: number[][] = Array.from({ length: p }, () =>
      new Array(p).fill(0)
    );

    for (let i = 0; i < design.length; i++) {
      const x = design[i];
      let eta = 0;
      for (let j = 0; j < p; j++) eta += beta[j] * x[j];
      const mu = Math.exp(Math.min(3.5, eta));
      const residual = counts[i] - mu;
      for (let j = 0; j < p; j++) {
        gradient[j] += residual * x[j];
        for (let k = 0; k < p; k++) hessian[j][k] += mu * x[j] * x[k];
      }
    }

    const step = solveLinearSystem(hessian, gradient);
    if (!step) break;
    let maxStep = 0;
    for (let j = 0; j < p; j++) {
      beta[j] += step[j];
      maxStep = Math.max(maxStep, Math.abs(step[j]));
    }
    if (maxStep < 1e-10) break;
  }
  return beta;
}
