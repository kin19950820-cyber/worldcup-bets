# 量化分析模組 (Quant Module)

A self-contained quantitative betting research module inside the World Cup
webapp. It independently estimates match probabilities from historical data,
compares them against live HKJC odds, and surfaces expected value, edge and
Kelly staking — with a fully out-of-sample backtest attached to every deploy.

**It never copies bookmaker odds.** Model probabilities come only from the
trained rating/goal models; HKJC prices are used solely as the comparison
benchmark and for EV computation.

---

## Architecture

```
scripts/quant-train.ts        offline training + walk-forward backtest
        │  writes
        ▼
lib/quant/data/               versioned model artifacts (committed JSON)
  ├─ ratings.json             final Elo per national team (334 teams)
  ├─ params.json              Poisson GLM coefficients + Dixon-Coles rho
  └─ backtest.json            out-of-sample evaluation metrics
        │  read by
        ▼
lib/quant/                    pure, dependency-free TypeScript
  ├─ elo.ts                   World Football Elo (K, G, expectancy, update)
  ├─ math.ts                  Poisson, Dixon-Coles, score matrix, EV, Kelly,
  │                           margin removal, Poisson GLM (Newton/IRLS)
  ├─ teams.ts                 name resolution / historical merges
  ├─ model.ts                 inference: (home, away) → MatchAnalysis
  └─ evaluate.ts              HKJC option parsing → per-option EV/edge/Kelly
        │  used by
        ▼
app/(main)/quant/page.tsx     dashboard (server component, zh-Hant)
```

Data sources:
- Internationals: [martj42/international_results](https://github.com/martj42/international_results)
  — every official international match since 1872 (~49,500 completed matches).
- Clubs (英超模型): [football-data.co.uk](https://www.football-data.co.uk) —
  Premier League + Championship since 2010 (~15,000 matches) **including
  closing odds**, which enables a genuine ROI backtest. Club artifacts are
  `club-ratings.json` / `club-params.json` / `club-backtest.json`; club Elo
  uses K = 20, home advantage 70, and a two-parameter GLM (home advantage
  absorbed into the intercepts). `analyzeFixture` routes to the club model
  when the teams resolve as clubs rather than national teams.

**Club model honesty note:** the club backtest bets flat stakes on any
outcome with model EV ≥ 5% against Bet365 closing odds. Result over
2024-07 → 2026-05 (760 E0 matches, 426 bets): **ROI −15.1%**. A ratings-only
model does *not* beat the closing line in a market as efficient as the EPL —
this is the expected result, it is displayed on the dashboard, and club
value flags should be read as "model disagrees with market", not "free
money". The international model cannot be ROI-backtested (no free historical
odds) but shows strong probabilistic skill vs baseline.

## Retraining

```bash
npm run quant:train
```

Downloads the latest results, recomputes ratings, refits the goal model,
re-runs the backtest and rewrites `lib/quant/data/*.json`. Commit the JSON
diff to deploy the new model. (Roadmap: run this in CI on a schedule.)

---

## Mathematics

### 1. Team strength — World Football Elo

For each match, with `dr = R_home + HFA·(1−neutral) − R_away`, HFA = 100:

```
W_e = 1 / (10^(−dr/400) + 1)
R'  = R + K · G · (W − W_e)
```

- `K` by importance: World Cup finals 60, qualifiers 40, continental finals
  50, friendlies 20, other 30.
- `G` goal-margin multiplier: 1 (margin ≤ 1), 1.5 (= 2), (11+margin)/8 (≥ 3).
- Successor states merged (West Germany→Germany, USSR→Russia, …) so rating
  history is continuous.

### 2. Goal expectancy — Poisson regression (log link)

With `d = (R_home − R_away)/400` and `host ∈ {0,1}` (2026 hosts: USA, Canada,
Mexico), fitted by maximum likelihood (Newton–Raphson) on 1990–2017:

```
λ_home = exp(0.3604 + 0.7523·d + 0.0364·host)
λ_away = exp(0.2729 − 0.7937·d − 0.3696·host)
```

Note the fitted home advantage acts mainly by *suppressing away goals*
(−0.370) rather than inflating home goals (+0.036) — consistent with the
football literature.

### 3. Score matrix — Dixon-Coles adjusted Poisson

```
P(h, a) = τ(h, a) · Pois(h; λ_home) · Pois(a; λ_away)
```

with the Dixon & Coles (1997) low-score dependence term τ applied to
{0,1}×{0,1} and `ρ = −0.06` estimated by profile likelihood grid search.
The 11×11 matrix is renormalized and yields, in closed form: 1X2, total-goals
distribution, margin distribution, correct scores. (Monte Carlo is
unnecessary — the analytic matrix is exact where simulation would only
approximate it.)

### 4. Market comparison

- Implied probability `1/odds`; bookmaker margin removed proportionally
  within each complete market: `p_fair(i) = (1/o_i) / Σ_j (1/o_j)`.
- `EV = p_model · odds − 1` (per unit stake). Asian handicap and over/under
  EVs are settled exactly against the margin/total distributions, including
  pushes, half-wins and half-losses on quarter and split lines.
- `Edge = p_model − p_fair`.

### 5. Staking — fractional Kelly

```
f* = (p·o − 1) / (o − 1)        (generalized as EV/(o−1) for push markets)
suggested stake = balance · f*/4, capped at 10% of balance
```

Quarter Kelly is deliberate: full Kelly is optimal only if the model
probabilities are exactly right, and drawdown scales brutally with
overestimation.

---

## Backtest (walk-forward, fully out-of-sample)

Every prediction for match *t* uses only ratings computed from matches
*< t*; the GLM/ρ are fitted on 1990–2017 and evaluated on 2018 → present
(8,208 matches, includes WC 2018/2022 and the current tournament).

| Metric (1X2) | Model | Base-rate baseline |
|---|---|---|
| Multiclass Brier score | **0.513** | 0.634 |
| Log loss | **0.872** | 1.051 |
| Top-pick accuracy | **60.2%** | — |

Calibration (predicted home-win probability vs realized frequency) is within
~3 pp across all ten deciles, with mild overconfidence at the extremes
(90–100% bucket: predicted 94.7%, realized 90.6%). Full table in
`lib/quant/data/backtest.json`.

**What this backtest does *not* show:** betting ROI. Historical closing odds
for internationals are not freely available at scale, so the module proves
*probabilistic skill* (calibration, Brier, log loss vs baseline) rather than
*market-beating ROI*. Treat the EV screen as decision support, not a money
printer — HKJC overrounds are large (often 12–25%), which is exactly why the
dashboard shows the margin-removed fair probability next to the model's.

## Honest limitations

- No player-level inputs (injuries, lineups, fatigue, xG) — free,
  reliable sources for internationals don't exist; Elo absorbs form slowly.
- Slight overconfidence for heavy favourites at the tails.
- Half-time markets, 特別項目 outrights and parlays are not modelled.
- Ratings freeze at train time; retrain during the tournament
  (`npm run quant:train`) to fold in the latest results.

## Roadmap vs the full research-platform spec

| Spec area | Status | Notes |
|---|---|---|
| Data engineering | ✅ core / 🔜 more | Results+Elo done; odds snapshots → store HKJC odds per sync to measure CLV |
| Feature engineering | 🔜 | Rest days & fixture congestion derivable from same dataset |
| Poisson / Dixon-Coles / Elo / MLE | ✅ | This module |
| Bayesian hierarchical, GBMs, deep nets | ❌ | Needs a Python service + richer features; marginal gain over DC for internationals is small |
| Ensemble | ✅ minimal | Elo-vs-DC agreement shown; proper stacking needs more base models |
| Market analysis | ✅ | Margin removal, EV, edge; CLV needs stored odds history |
| Bet selection engine | ✅ | EV threshold + Kelly + confidence + agreement |
| Bankroll management | ✅ minimal | Quarter Kelly + 10% cap; portfolio correlation control not implemented |
| Backtesting | ✅ probabilistic | ROI backtest blocked on historical odds; forward CLV tracking is the practical substitute |
| ML pipeline / retraining | ✅ manual | `npm run quant:train`; schedule via CI cron next |
| Dashboard | ✅ | `/quant` |
