// Group prize pool — pure, side-effect-free money math shared by the group
// settings action and the UI. The pool is REAL money contributed by members,
// tracked separately from every player's in-game balance.
//
//   pool = memberCount * buyinAmount + totalRebuys * rebuyAmount
// where totalRebuys is the sum of members' in-game loan (rebuy) counts.

export type PrizePoolSettings = {
  buyinAmount: number;
  rebuyAmount: number;
  payoutFirst: number; // whole-percent split for 冠/亞/季
  payoutSecond: number;
  payoutThird: number;
};

export const DEFAULT_PRIZE_POOL: PrizePoolSettings = {
  buyinAmount: 0,
  rebuyAmount: 0,
  payoutFirst: 50,
  payoutSecond: 30,
  payoutThird: 20,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type PrizePool = {
  memberCount: number;
  totalRebuys: number;
  buyinTotal: number; // memberCount * buyinAmount
  rebuyTotal: number; // totalRebuys * rebuyAmount
  pool: number;
  payouts: { first: number; second: number; third: number };
};

export function computePrizePool(
  settings: PrizePoolSettings,
  memberCount: number,
  totalRebuys: number
): PrizePool {
  const buyinTotal = round2(memberCount * settings.buyinAmount);
  const rebuyTotal = round2(totalRebuys * settings.rebuyAmount);
  const pool = round2(buyinTotal + rebuyTotal);
  return {
    memberCount,
    totalRebuys,
    buyinTotal,
    rebuyTotal,
    pool,
    payouts: {
      first: round2((pool * settings.payoutFirst) / 100),
      second: round2((pool * settings.payoutSecond) / 100),
      third: round2((pool * settings.payoutThird) / 100),
    },
  };
}

// Validates buy-in amounts and that the 冠/亞/季 ratios are whole numbers in
// [0, 100] summing to exactly 100. Returns a zh-Hant error, or null when valid.
export function validatePrizePoolSettings(
  settings: PrizePoolSettings
): string | null {
  const { buyinAmount, rebuyAmount, payoutFirst, payoutSecond, payoutThird } =
    settings;
  if (!Number.isFinite(buyinAmount) || buyinAmount < 0) {
    return "基本買入金額不能為負數";
  }
  if (!Number.isFinite(rebuyAmount) || rebuyAmount < 0) {
    return "額外買入金額不能為負數";
  }
  for (const ratio of [payoutFirst, payoutSecond, payoutThird]) {
    if (!Number.isInteger(ratio) || ratio < 0 || ratio > 100) {
      return "分獎比率須為 0–100 的整數";
    }
  }
  if (payoutFirst + payoutSecond + payoutThird !== 100) {
    return "冠、亞、季分獎比率合計必須為 100%";
  }
  return null;
}
