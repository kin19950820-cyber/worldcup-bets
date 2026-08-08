import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ACTIVE_SEASON_ID,
  Fixtures,
  getBet,
  getProfile,
  getSeasonPlayer,
  getTransactions,
  requireTestEnv,
  testAdminClient,
} from "./setup";

// Exercises the atomic place_single_bet / place_parlay RPCs
// (supabase/migrations/20260724000100_season2_phase2_activation.sql) against
// a real Postgres instance. Run with: npm run test:integration
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

describe("place_single_bet", () => {
  it("deducts stake, creates a pending bet and a stake_deduct transaction", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match();

    const { data, error } = await admin.rpc("place_single_bet", {
      p_user_id: user.id,
      p_match_id: matchId,
      p_bet_type: "獨贏",
      p_selection: "Test Home",
      p_odds: 2,
      p_stake: 100,
    });

    expect(error).toBeNull();
    const result = data as { bet_id: string; new_balance: number; season_id: number };
    expect(result.new_balance).toBe(400);
    expect(result.season_id).toBe(ACTIVE_SEASON_ID);

    const bet = await getBet(admin, result.bet_id);
    expect(bet.status).toBe("pending");
    expect(bet.stake).toBe(100);
    expect(bet.possible_return).toBe(200);

    const player = await getSeasonPlayer(admin, user.id);
    expect(player.current_balance).toBe(400);
    const profile = await getProfile(admin, user.id);
    expect(profile.current_balance).toBe(400);

    const txns = await getTransactions(admin, user.id);
    const stakeTxn = txns.find((t) => t.bet_id === result.bet_id);
    expect(stakeTxn?.type).toBe("stake_deduct");
    expect(stakeTxn?.amount).toBe(-100);
    expect(stakeTxn?.balance_after).toBe(400);
  });

  it("rejects insufficient balance and leaves state untouched", async () => {
    const user = await fx.user({ balance: 50 });
    const matchId = await fx.match();

    const { error } = await admin.rpc("place_single_bet", {
      p_user_id: user.id,
      p_match_id: matchId,
      p_bet_type: "獨贏",
      p_selection: "Test Home",
      p_odds: 2,
      p_stake: 100,
    });

    expect(error?.message).toContain("INSUFFICIENT_BALANCE");
    const player = await getSeasonPlayer(admin, user.id);
    expect(player.current_balance).toBe(50);
    const txns = await getTransactions(admin, user.id);
    expect(txns.length).toBe(0);
  });

  it("rejects a match belonging to a different season", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match({ seasonId: 1 });

    const { error } = await admin.rpc("place_single_bet", {
      p_user_id: user.id,
      p_match_id: matchId,
      p_bet_type: "獨贏",
      p_selection: "Test Home",
      p_odds: 2,
      p_stake: 50,
    });

    expect(error?.message).toContain("MATCH_WRONG_SEASON");
  });

  it("enforces the cutoff (kickoff - 5 minutes)", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match({ kickoffOffsetMinutes: 1 });

    const { error } = await admin.rpc("place_single_bet", {
      p_user_id: user.id,
      p_match_id: matchId,
      p_bet_type: "獨贏",
      p_selection: "Test Home",
      p_odds: 2,
      p_stake: 50,
    });

    expect(error?.message).toContain("BETTING_CLOSED");
  });

  it("rejects a FINISHED match regardless of kickoff time", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match({ kickoffOffsetMinutes: 120, status: "FINISHED" });

    const { error } = await admin.rpc("place_single_bet", {
      p_user_id: user.id,
      p_match_id: matchId,
      p_bet_type: "獨贏",
      p_selection: "Test Home",
      p_odds: 2,
      p_stake: 50,
    });

    expect(error?.message).toContain("BETTING_CLOSED");
  });

  it("caps single-bet stake at $100 while in debt", async () => {
    const user = await fx.user({ balance: 500, debt: 550 });
    const matchId = await fx.match();

    const { error } = await admin.rpc("place_single_bet", {
      p_user_id: user.id,
      p_match_id: matchId,
      p_bet_type: "獨贏",
      p_selection: "Test Home",
      p_odds: 2,
      p_stake: 101,
    });

    expect(error?.message).toContain("DEBT_STAKE_LIMIT");
  });

  it("allows a $100 stake while in debt", async () => {
    const user = await fx.user({ balance: 500, debt: 550 });
    const matchId = await fx.match();

    const { error } = await admin.rpc("place_single_bet", {
      p_user_id: user.id,
      p_match_id: matchId,
      p_bet_type: "獨贏",
      p_selection: "Test Home",
      p_odds: 2,
      p_stake: 100,
    });

    expect(error).toBeNull();
  });

  it("rejects bad odds and non-positive stakes", async () => {
    const user = await fx.user({ balance: 500 });
    const matchId = await fx.match();

    const badOdds = await admin.rpc("place_single_bet", {
      p_user_id: user.id,
      p_match_id: matchId,
      p_bet_type: "獨贏",
      p_selection: "Test Home",
      p_odds: 1,
      p_stake: 50,
    });
    expect(badOdds.error?.message).toContain("BAD_ODDS");

    const badStake = await admin.rpc("place_single_bet", {
      p_user_id: user.id,
      p_match_id: matchId,
      p_bet_type: "獨贏",
      p_selection: "Test Home",
      p_odds: 2,
      p_stake: 0,
    });
    expect(badStake.error?.message).toContain("BAD_STAKE");
  });

  it("runs two concurrent bets sequentially under the row lock — no double-spend", async () => {
    const user = await fx.user({ balance: 500 });
    const matchA = await fx.match();
    const matchB = await fx.match();

    const [a, b] = await Promise.all([
      admin.rpc("place_single_bet", {
        p_user_id: user.id,
        p_match_id: matchA,
        p_bet_type: "獨贏",
        p_selection: "Test Home",
        p_odds: 2,
        p_stake: 300,
      }),
      admin.rpc("place_single_bet", {
        p_user_id: user.id,
        p_match_id: matchB,
        p_bet_type: "獨贏",
        p_selection: "Test Home",
        p_odds: 2,
        p_stake: 300,
      }),
    ]);

    // FOR UPDATE serializes the two calls: exactly one must succeed, since
    // both stakes together ($600) exceed the $500 starting balance.
    const results = [a, b];
    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(failed[0].error?.message).toContain("INSUFFICIENT_BALANCE");

    const player = await getSeasonPlayer(admin, user.id);
    expect(player.current_balance).toBe(200);
    const profile = await getProfile(admin, user.id);
    expect(profile.current_balance).toBe(200); // stays in sync with season_players
  });
});

describe("place_parlay", () => {
  it("deducts stake once and stores all legs on one bet row", async () => {
    const user = await fx.user({ balance: 500 });
    const matchA = await fx.match();
    const matchB = await fx.match();

    const { data, error } = await admin.rpc("place_parlay", {
      p_user_id: user.id,
      p_match_ids: [matchA, matchB],
      p_selection: JSON.stringify({ version: 1, legs: [] }),
      p_total_odds: 4,
      p_stake: 50,
    });

    expect(error).toBeNull();
    const result = data as { bet_id: string; new_balance: number };
    expect(result.new_balance).toBe(450);

    const bet = await getBet(admin, result.bet_id);
    expect(bet.bet_type).toBe("過關");
    expect(bet.match_id).toBe(matchA); // primary leg = p_match_ids[1]
  });

  it("blocks parlays while in debt", async () => {
    const user = await fx.user({ balance: 500, debt: 100 });
    const matchA = await fx.match();
    const matchB = await fx.match();

    const { error } = await admin.rpc("place_parlay", {
      p_user_id: user.id,
      p_match_ids: [matchA, matchB],
      p_selection: "{}",
      p_total_odds: 4,
      p_stake: 20,
    });

    expect(error?.message).toContain("DEBT_NO_PARLAY");
  });

  it("rejects if any leg is past cutoff (rolls back the whole parlay)", async () => {
    const user = await fx.user({ balance: 500 });
    const matchA = await fx.match();
    const matchClosed = await fx.match({ kickoffOffsetMinutes: 1 });

    const { error } = await admin.rpc("place_parlay", {
      p_user_id: user.id,
      p_match_ids: [matchA, matchClosed],
      p_selection: "{}",
      p_total_odds: 4,
      p_stake: 20,
    });

    expect(error?.message).toContain("BETTING_CLOSED");
    // No partial effects: balance untouched, no bet row created.
    const player = await getSeasonPlayer(admin, user.id);
    expect(player.current_balance).toBe(500);
    const txns = await getTransactions(admin, user.id);
    expect(txns.length).toBe(0);
  });

  it("rejects a leg from the wrong season (full rollback)", async () => {
    const user = await fx.user({ balance: 500 });
    const matchA = await fx.match();
    const matchWrongSeason = await fx.match({ seasonId: 1 });

    const { error } = await admin.rpc("place_parlay", {
      p_user_id: user.id,
      p_match_ids: [matchA, matchWrongSeason],
      p_selection: "{}",
      p_total_odds: 4,
      p_stake: 20,
    });

    expect(error?.message).toContain("MATCH_WRONG_SEASON");
    const player = await getSeasonPlayer(admin, user.id);
    expect(player.current_balance).toBe(500);
  });
});
