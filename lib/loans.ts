const LOAN_TIER_SIZE = 1000;
const INTEREST_STEP = 0.05;
const DAYS_PER_YEAR = 365;

export type LoanTransaction = {
  amount: number;
  type: string;
  created_at: string;
};

export type LoanBalance = {
  principal: number;
  accruedInterest: number;
  totalOwed: number;
  effectiveAnnualRate: number;
};

export function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function calculateAnnualInterestAmount(principal: number) {
  let remaining = Math.max(principal, 0);
  let tier = 1;
  let interest = 0;

  while (remaining > 0) {
    const chunk = Math.min(remaining, LOAN_TIER_SIZE);
    interest += chunk * tier * INTEREST_STEP;
    remaining -= chunk;
    tier += 1;
  }

  return interest;
}

export function calculateLoanBalance(
  transactions: LoanTransaction[],
  asOf = new Date()
): LoanBalance {
  let principal = 0;
  let accruedInterest = 0;
  let previousDate: Date | null = null;

  for (const transaction of [...transactions].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )) {
    const transactionDate = new Date(transaction.created_at);

    if (previousDate && transactionDate > previousDate && principal > 0) {
      const elapsedDays =
        (transactionDate.getTime() - previousDate.getTime()) / 86400000;
      accruedInterest +=
        (calculateAnnualInterestAmount(principal) * elapsedDays) /
        DAYS_PER_YEAR;
    }

    if (
      (transaction.type === "loan" || transaction.type === "adjustment") &&
      transaction.amount > 0
    ) {
      principal += transaction.amount;
    } else if (transaction.type === "loan_repayment") {
      let payment = Math.abs(transaction.amount);
      const interestPaid = Math.min(payment, accruedInterest);
      accruedInterest -= interestPaid;
      payment -= interestPaid;
      principal = Math.max(0, principal - payment);
    }

    previousDate = transactionDate;
  }

  if (previousDate && asOf > previousDate && principal > 0) {
    const elapsedDays = (asOf.getTime() - previousDate.getTime()) / 86400000;
    accruedInterest +=
      (calculateAnnualInterestAmount(principal) * elapsedDays) / DAYS_PER_YEAR;
  }

  const roundedPrincipal = roundMoney(principal);
  const roundedInterest = roundMoney(accruedInterest);

  return {
    principal: roundedPrincipal,
    accruedInterest: roundedInterest,
    totalOwed: roundMoney(roundedPrincipal + roundedInterest),
    effectiveAnnualRate:
      roundedPrincipal > 0
        ? calculateAnnualInterestAmount(roundedPrincipal) / roundedPrincipal
        : 0,
  };
}
