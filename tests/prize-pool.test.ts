import { describe, it, expect } from "vitest";
import {
  computePrizePool,
  validatePrizePoolSettings,
  DEFAULT_PRIZE_POOL,
} from "@/lib/prize-pool";

describe("computePrizePool", () => {
  it("pool = members*buyin + rebuys*rebuyAmount", () => {
    const p = computePrizePool(
      { buyinAmount: 100, rebuyAmount: 50, payoutFirst: 50, payoutSecond: 30, payoutThird: 20 },
      4, // members
      3 // total rebuys
    );
    expect(p.buyinTotal).toBe(400);
    expect(p.rebuyTotal).toBe(150);
    expect(p.pool).toBe(550);
  });

  it("splits the pool by the 冠/亞/季 ratios", () => {
    const p = computePrizePool(
      { buyinAmount: 100, rebuyAmount: 0, payoutFirst: 50, payoutSecond: 30, payoutThird: 20 },
      10,
      0
    );
    expect(p.pool).toBe(1000);
    expect(p.payouts.first).toBe(500);
    expect(p.payouts.second).toBe(300);
    expect(p.payouts.third).toBe(200);
  });

  it("zero buy-ins => empty pool", () => {
    const p = computePrizePool(DEFAULT_PRIZE_POOL, 5, 2);
    expect(p.pool).toBe(0);
  });
});

describe("validatePrizePoolSettings", () => {
  it("accepts ratios summing to 100", () => {
    expect(
      validatePrizePoolSettings({
        buyinAmount: 100,
        rebuyAmount: 50,
        payoutFirst: 50,
        payoutSecond: 30,
        payoutThird: 20,
      })
    ).toBeNull();
  });

  it("rejects ratios not summing to 100", () => {
    expect(
      validatePrizePoolSettings({
        buyinAmount: 100,
        rebuyAmount: 50,
        payoutFirst: 60,
        payoutSecond: 30,
        payoutThird: 20,
      })
    ).toContain("100%");
  });

  it("rejects negative buy-in", () => {
    expect(
      validatePrizePoolSettings({
        buyinAmount: -1,
        rebuyAmount: 0,
        payoutFirst: 50,
        payoutSecond: 30,
        payoutThird: 20,
      })
    ).toContain("負數");
  });

  it("rejects non-integer ratios", () => {
    expect(
      validatePrizePoolSettings({
        buyinAmount: 0,
        rebuyAmount: 0,
        payoutFirst: 33.3,
        payoutSecond: 33.3,
        payoutThird: 33.4,
      })
    ).toContain("整數");
  });
});
