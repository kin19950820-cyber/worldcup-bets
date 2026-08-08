import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  Fixtures,
  getBet,
  getProfile,
  getSeasonPlayer,
  getTransactions,
  requireTestEnv,
  testAdminClient,
} from "./setup";

// Exercises settle_bet_season2 (debt-first repayment, double-settlement
// guard) from 20260724000100_season2_phase2_activation.sql.
beforeAll(() => {
  requireTestEnv();
});

const admin = testAdminClient();
let fx: Fixtures;

beforeAll(() => {
  fx = new Fixtures(admin);
});

afterEach(async () => {
  await fx.cleanup();
});

async function placeBet(userId: string, matchId: string, stake = 100, odds = 2) {
  const { data, error } = await admin.rpc("place_single_bet", {
    p_user_id: userId,
    p_match_id: matchId,
    p_bet_type: "獨贏",
    p_selection: "Test Home",
    p_odds: odds,
    p_stake: stake,
  });
  if (error) throw new Error(error.message);
  return (data as { bet_id: string }).bet_id;
}

describe("settle_bet_season2", () => {
  it("won: pays stake*odds, credited as cash", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match();
    const betId = await placeBet(user.id, matchId, 100, 2);

    const { data, error } = await admin.rpc("settle_bet_season2", {
      p_bet_id: betId,
      p_result: "won",
    });
    expect(error).toBeNull();
    const r = data as { payout: number; new_balance: number };
    expect(r.payout).toBe(200);
    expect(r.new_balance).toBe(600); // 400 after stake + 200 payout

    const bet = await getBet(admin, betId);
    expect(bet.status).toBe("won");
    expect(bet.payout).toBe(200);
  });

  it("lost: pays nothing, balance stays at post-stake level", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match();
    const betId = await placeBet(user.id, matchId, 100, 2);

    const { data } = await admin.rpc("settle_bet_season2", {
      p_bet_id: betId,
      p_result: "lost",
    });
    const r = data as { payout: number; new_balance: number };
    expect(r.payout).toBe(0);
    expect(r.new_balance).toBe(400);
  });

  it("void: refunds the full stake", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match();
    const betId = await placeBet(user.id, matchId, 100, 2);

    const { data } = await admin.rpc("settle_bet_season2", {
      p_bet_id: betId,
      p_result: "void",
    });
    const r = data as { payout: number; new_balance: number };
    expect(r.payout).toBe(100);
    expect(r.new_balance).toBe(500);
  });

  it("half_won: stake back + half the profit", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match();
    const betId = await placeBet(user.id, matchId, 100, 2); // profit = 100

    const { data } = await admin.rpc("settle_bet_season2", {
      p_bet_id: betId,
      p_result: "half_won",
    });
    const r = data as { payout: number; new_balance: number };
    expect(r.payout).toBe(150); // 100 + 100/2
    expect(r.new_balance).toBe(550);
  });

  it("half_lost: half the stake back", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match();
    const betId = await placeBet(user.id, matchId, 100, 2);

    const { data } = await admin.rpc("settle_bet_season2", {
      p_bet_id: betId,
      p_result: "half_lost",
    });
    const r = data as { payout: number; new_balance: number };
    expect(r.payout).toBe(50);
    expect(r.new_balance).toBe(450);
  });

  it("rejects double settlement", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match();
    const betId = await placeBet(user.id, matchId, 100, 2);

    const first = await admin.rpc("settle_bet_season2", {
      p_bet_id: betId,
      p_result: "won",
    });
    expect(first.error).toBeNull();

    const second = await admin.rpc("settle_bet_season2", {
      p_bet_id: betId,
      p_result: "lost",
    });
    expect(second.error?.message).toContain("ALREADY_SETTLED");

    // Balance must reflect only the first settlement.
    const player = await getSeasonPlayer(admin, user.id);
    expect(player.current_balance).toBe(600);
  });

  it("debt-first: payout repays debt before crediting cash", async () => {
    const user = await fx.user({ balance: 40, debt: 550 });
    const matchId = await fx.match();
    // Debt-period stake cap is $100.
    const betId = await placeBet(user.id, matchId, 40, 10); // payout on win = 400

    const { data } = await admin.rpc("settle_bet_season2", {
      p_bet_id: betId,
      p_result: "won",
    });
    const r = data as {
      payout: number;
      debt_repaid: number;
      cash_credited: number;
      outstanding_debt: number;
      new_balance: number;
    };
    expect(r.payout).toBe(400);
    expect(r.debt_repaid).toBe(400);
    expect(r.cash_credited).toBe(0);
    expect(r.outstanding_debt).toBe(150); // 550 - 400
    expect(r.new_balance).toBe(0); // stake already deducted, no cash credited

    const player = await getSeasonPlayer(admin, user.id);
    expect(player.outstanding_debt).toBe(150);
    expect(player.current_balance).toBe(0);

    const txns = await getTransactions(admin, user.id);
    const repayment = txns.find((t) => t.type === "debt_repayment");
    expect(repayment?.amount).toBe(-400);
  });

  it("debt-first: payout exceeding debt clears debt and credits remainder as cash", async () => {
    const user = await fx.user({ balance: 40, debt: 100 });
    const matchId = await fx.match();
    const betId = await placeBet(user.id, matchId, 40, 10); // payout on win = 400

    const { data } = await admin.rpc("settle_bet_season2", {
      p_bet_id: betId,
      p_result: "won",
    });
    const r = data as {
      payout: number;
      debt_repaid: number;
      cash_credited: number;
      outstanding_debt: number;
      new_balance: number;
    };
    expect(r.debt_repaid).toBe(100);
    expect(r.cash_credited).toBe(300);
    expect(r.outstanding_debt).toBe(0);
    expect(r.new_balance).toBe(300); // 0 (post-stake) + 300 cash

    const profile = await getProfile(admin, user.id);
    expect(profile.current_balance).toBe(300); // profiles mirrors season_players
  });

  it("rejects settling a bet that does not exist", async () => {
    const { error } = await admin.rpc("settle_bet_season2", {
      p_bet_id: "00000000-0000-0000-0000-000000000000",
      p_result: "won",
    });
    expect(error?.message).toContain("BET_NOT_FOUND");
  });

  it("keeps profiles.current_balance and season_players.current_balance in sync after settlement", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match();
    const betId = await placeBet(user.id, matchId, 100, 3);

    await admin.rpc("settle_bet_season2", { p_bet_id: betId, p_result: "won" });

    const [player, profile] = await Promise.all([
      getSeasonPlayer(admin, user.id),
      getProfile(admin, user.id),
    ]);
    expect(profile.current_balance).toBe(player.current_balance);
  });
});
