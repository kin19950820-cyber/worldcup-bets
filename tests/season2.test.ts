import { describe, it, expect } from "vitest";
import {
  loanEligibility,
  applyLoan,
  applyDebtRepayment,
  betRestrictions,
  validateStake,
  SEASON2_LOAN,
} from "@/lib/season2-loans";
import { isMatchBettable, bettingClosesAt } from "@/lib/match-status";
import {
  getActiveSeason,
  getDefaultSeason,
  seasonIdForDate,
} from "@/lib/seasons";
import { evaluateOptions } from "@/lib/quant/evaluate";
import type { MatchAnalysis } from "@/lib/quant/model";

// --------------------------------------------------------------------------
// Loan eligibility
// --------------------------------------------------------------------------
describe("loan eligibility", () => {
  it("balance $99, no debt, 0 loans => allowed", () => {
    expect(
      loanEligibility({ currentBalance: 99, outstandingDebt: 0, loanCount: 0 })
        .allowed
    ).toBe(true);
  });

  it("balance $100 => allowed (threshold is inclusive)", () => {
    const r = loanEligibility({
      currentBalance: 100,
      outstandingDebt: 0,
      loanCount: 0,
    });
    expect(r.allowed).toBe(true);
  });

  it("balance $101 => rejected (above the $100 threshold)", () => {
    const r = loanEligibility({
      currentBalance: 101,
      outstandingDebt: 0,
      loanCount: 0,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("現時餘額須為 $100 或以下才可借款");
  });

  it("balance $0, debt $550 => rejected for debt", () => {
    const r = loanEligibility({
      currentBalance: 0,
      outstandingDebt: 550,
      loanCount: 1,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("請先清還現有欠款");
  });

  it("balance $50, loan_count 2 => rejected for loan limit", () => {
    const r = loanEligibility({
      currentBalance: 50,
      outstandingDebt: 0,
      loanCount: 2,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("本季借款次數已用完");
  });
});

// --------------------------------------------------------------------------
// Loan creation
// --------------------------------------------------------------------------
describe("loan creation", () => {
  it("adds exactly $500 cash, $550 debt, +1 loan", () => {
    const { state, ledger } = applyLoan({
      currentBalance: 40,
      outstandingDebt: 0,
      loanCount: 0,
    });
    expect(state.currentBalance).toBe(540);
    expect(state.outstandingDebt).toBe(550);
    expect(state.loanCount).toBe(1);

    const principal = ledger.find((e) => e.type === "loan_principal")!;
    const fee = ledger.find((e) => e.type === "loan_fee")!;
    expect(principal.amount).toBe(500);
    expect(principal.affectsCash).toBe(true);
    expect(fee.amount).toBe(50);
    expect(fee.affectsCash).toBe(false); // fee never becomes usable cash
  });

  it("constants match the spec", () => {
    expect(SEASON2_LOAN.amount).toBe(500);
    expect(SEASON2_LOAN.fee).toBe(50);
    expect(SEASON2_LOAN.debt).toBe(550);
    expect(SEASON2_LOAN.maxLoans).toBe(2);
  });
});

// --------------------------------------------------------------------------
// Debt-first repayment
// --------------------------------------------------------------------------
describe("automatic debt repayment", () => {
  it("payout $300 vs debt $550 => debt $250, cash $0", () => {
    const r = applyDebtRepayment(300, 550);
    expect(r.debtRepaid).toBe(300);
    expect(r.newDebt).toBe(250);
    expect(r.cashCredited).toBe(0);
  });

  it("payout $800 vs debt $550 => debt $0, cash $250", () => {
    const r = applyDebtRepayment(800, 550);
    expect(r.debtRepaid).toBe(550);
    expect(r.newDebt).toBe(0);
    expect(r.cashCredited).toBe(250);
  });

  it("payout with no debt credits all cash", () => {
    const r = applyDebtRepayment(300, 0);
    expect(r.debtRepaid).toBe(0);
    expect(r.cashCredited).toBe(300);
  });
});

// --------------------------------------------------------------------------
// Bet restrictions while in debt
// --------------------------------------------------------------------------
describe("bet restrictions while indebted", () => {
  it("indebted single bet $100 => allowed", () => {
    expect(
      validateStake({
        stake: 100,
        currentBalance: 540,
        outstandingDebt: 550,
        isParlay: false,
      })
    ).toBeNull();
  });

  it("indebted single bet $101 => rejected", () => {
    expect(
      validateStake({
        stake: 101,
        currentBalance: 540,
        outstandingDebt: 550,
        isParlay: false,
      })
    ).toContain("單注上限");
  });

  it("indebted parlay => rejected", () => {
    expect(
      validateStake({
        stake: 20,
        currentBalance: 540,
        outstandingDebt: 550,
        isParlay: true,
      })
    ).toContain("過關");
  });

  it("debt-free player has no stake cap and can parlay", () => {
    const r = betRestrictions(0);
    expect(r.maxSingleStake).toBe(Number.POSITIVE_INFINITY);
    expect(r.parlayAllowed).toBe(true);
  });

  it("stake beyond balance is rejected", () => {
    expect(
      validateStake({
        stake: 600,
        currentBalance: 500,
        outstandingDebt: 0,
        isParlay: false,
      })
    ).toContain("餘額不足");
  });
});

// --------------------------------------------------------------------------
// Betting cutoff — closes 5 minutes before kickoff
// --------------------------------------------------------------------------
describe("betting cutoff (kickoff - 5 min)", () => {
  const kickoff = "2026-08-15T14:00:00Z";

  it("more than 5 minutes before kickoff => bettable", () => {
    const now = new Date("2026-08-15T13:54:00Z"); // 6 min before
    expect(isMatchBettable({ status: "TIMED", kickoff_time: kickoff }, now)).toBe(
      true
    );
  });

  it("exactly 5 minutes before kickoff => blocked", () => {
    const now = new Date("2026-08-15T13:55:00Z"); // == cutoff
    expect(isMatchBettable({ status: "TIMED", kickoff_time: kickoff }, now)).toBe(
      false
    );
  });

  it("after kickoff => blocked", () => {
    const now = new Date("2026-08-15T14:30:00Z");
    expect(isMatchBettable({ status: "TIMED", kickoff_time: kickoff }, now)).toBe(
      false
    );
  });

  it("finished match => blocked regardless of time", () => {
    const now = new Date("2026-08-15T13:00:00Z");
    expect(
      isMatchBettable({ status: "FINISHED", kickoff_time: kickoff }, now)
    ).toBe(false);
  });

  it("cutoff instant is exactly 5 minutes before kickoff", () => {
    expect(bettingClosesAt(kickoff).toISOString()).toBe("2026-08-15T13:55:00.000Z");
  });
});

// --------------------------------------------------------------------------
// Season isolation / defaulting
// --------------------------------------------------------------------------
describe("season configuration", () => {
  it("active season is season 2 (英超), not the completed one", () => {
    expect(getActiveSeason().id).toBe(2);
    expect(getActiveSeason().ended).toBe(false);
  });

  it("default season is the ACTIVE season, never a completed one", () => {
    expect(getDefaultSeason().id).toBe(getActiveSeason().id);
    expect(getDefaultSeason().ended).toBe(false);
  });

  it("timestamps map to the correct season window", () => {
    expect(seasonIdForDate("2026-07-01T00:00:00+08:00")).toBe(1); // World Cup
    expect(seasonIdForDate("2026-08-15T00:00:00+08:00")).toBe(2); // EPL
  });

  it("Season 2 players start at $500 (starting balance constant)", () => {
    // The starting balance the migration seeds; mirrored by the loan engine.
    expect(SEASON2_LOAN.eligibleBalanceAtMost).toBeLessThan(500);
  });
});

describe("quant recommendation safety gate", () => {
  const analysis: MatchAnalysis = {
    modelScope: "club",
    homeTeam: "Home",
    awayTeam: "Away",
    homeRating: 1500,
    awayRating: 1500,
    homeMatches: 100,
    awayMatches: 100,
    neutralVenue: false,
    lambdaHome: 1.5,
    lambdaAway: 1,
    probabilities: { home: 0.6, draw: 0.25, away: 0.15 },
    expectedTotalGoals: 2.5,
    topScores: [],
    eloExpectancy: 0.5,
    modelAgreement: 0.9,
    confidence: "medium",
    stakingAllowed: false,
    marginDist: [],
    totalDist: [],
    matrix: [],
  };

  it("does not label positive-EV club options as value when validation failed", () => {
    const [result] = evaluateOptions(
      [{
        id: "home",
        market: "1x2",
        bet_type: "主客和",
        selection: "Home",
        odds: 2,
        updated_at: null,
      }],
      "Home",
      "Away",
      analysis
    );

    expect(result.ev).toBeCloseTo(0.2);
    expect(result.kelly).toBe(0);
    expect(result.isValue).toBe(false);
  });
});
