// Season 2 loan rules — pure, side-effect-free logic shared by the server
// action, the Postgres RPC's TypeScript mirror, and the test suite.
//
// Rules (Season 2 only):
//   * Each loan is exactly $500, with a fixed $50 fee → $550 debt created.
//   * Only $500 is credited to usable cash; the $50 fee is debt-only.
//   * Eligible only when: cash <= $100 AND debt == 0 (rebuy count is unlimited).
//   * Cannot re-borrow until the previous loan is fully repaid.
//   * While in debt: max single stake $100, no parlays, no new loans.
//   * Winning payouts repay outstanding debt first, remainder becomes cash.

// Season 2 base (starting) balance. Each player begins with this; a rebuy
// (loan) is a fixed $500 regardless of the base.
export const SEASON2_STARTING_BALANCE = 1000;

export const SEASON2_LOAN = {
  amount: 500,
  fee: 50,
  debt: 550, // amount + fee
  eligibleBalanceAtMost: 100,
  indebtedMaxStake: 100,
} as const;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type SeasonPlayerState = {
  currentBalance: number;
  outstandingDebt: number;
  loanCount: number;
};

export type LoanEligibility = { allowed: boolean; reason: string | null };

// Reasons are checked in priority order so the message matches the most
// fundamental blocker first.
export function loanEligibility(state: SeasonPlayerState): LoanEligibility {
  // Rebuy count is unlimited; the only gates are outstanding debt and balance.
  if (state.outstandingDebt > 0) {
    return { allowed: false, reason: "請先清還現有欠款" };
  }
  if (state.currentBalance > SEASON2_LOAN.eligibleBalanceAtMost) {
    return { allowed: false, reason: "現時餘額須為 $100 或以下才可借款" };
  }
  return { allowed: true, reason: null };
}

export type LoanLedgerEntry = {
  type: "loan_principal" | "loan_fee";
  amount: number; // signed ledger amount
  affectsCash: boolean;
};

export type LoanApplication = {
  state: SeasonPlayerState;
  ledger: LoanLedgerEntry[];
};

// Applies one $500 loan to a player state. Caller must have checked eligibility
// (the DB RPC re-checks under a row lock to stay race-safe).
export function applyLoan(state: SeasonPlayerState): LoanApplication {
  return {
    state: {
      currentBalance: roundMoney(state.currentBalance + SEASON2_LOAN.amount),
      outstandingDebt: roundMoney(state.outstandingDebt + SEASON2_LOAN.debt),
      loanCount: state.loanCount + 1,
    },
    ledger: [
      { type: "loan_principal", amount: SEASON2_LOAN.amount, affectsCash: true },
      { type: "loan_fee", amount: SEASON2_LOAN.fee, affectsCash: false },
    ],
  };
}

export type DebtRepayment = {
  debtRepaid: number;
  cashCredited: number;
  newDebt: number;
};

// Splits a cash payout/refund into debt repayment (first) and usable cash.
export function applyDebtRepayment(
  payoutCash: number,
  outstandingDebt: number
): DebtRepayment {
  const cash = Math.max(0, roundMoney(payoutCash));
  const debt = Math.max(0, roundMoney(outstandingDebt));
  const debtRepaid = roundMoney(Math.min(cash, debt));
  return {
    debtRepaid,
    cashCredited: roundMoney(cash - debtRepaid),
    newDebt: roundMoney(debt - debtRepaid),
  };
}

export type BetRestrictions = {
  maxSingleStake: number;
  parlayAllowed: boolean;
};

export function betRestrictions(outstandingDebt: number): BetRestrictions {
  const inDebt = roundMoney(outstandingDebt) > 0;
  return {
    maxSingleStake: inDebt
      ? SEASON2_LOAN.indebtedMaxStake
      : Number.POSITIVE_INFINITY,
    parlayAllowed: !inDebt,
  };
}

// Validates a proposed stake against balance + debt restrictions. Returns the
// zh-Hant error to surface, or null when the stake is allowed.
export function validateStake({
  stake,
  currentBalance,
  outstandingDebt,
  isParlay,
}: {
  stake: number;
  currentBalance: number;
  outstandingDebt: number;
  isParlay: boolean;
}): string | null {
  if (!Number.isFinite(stake) || stake <= 0) return "投注額必須大於 0";
  const restrictions = betRestrictions(outstandingDebt);
  if (isParlay && !restrictions.parlayAllowed) {
    return "尚有欠款，暫時不能投注過關";
  }
  if (stake > restrictions.maxSingleStake) {
    return `尚有欠款，單注上限為 HK$${SEASON2_LOAN.indebtedMaxStake}`;
  }
  if (stake > currentBalance) {
    return `餘額不足，現時餘額：HK$${roundMoney(currentBalance).toFixed(2)}`;
  }
  return null;
}
