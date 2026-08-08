import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// ----------------------------------------------------------------------------
// Dedicated test-database harness for Supabase RPC integration tests.
//
// NEVER point this at production. Required env vars:
//   SUPABASE_TEST_URL               e.g. https://<test-project-ref>.supabase.co
//   SUPABASE_TEST_SERVICE_ROLE_KEY  service_role key of that SAME test project
//
// Setup (one-off, against the test project only):
//   1. Create a separate Supabase project reserved for testing.
//   2. Apply every migration in supabase/migrations/, in order:
//        npx supabase db push --db-url "postgresql://postgres:<pw>@db.<test-ref>.supabase.co:5432/postgres"
//   3. Put the two env vars above in tests/integration/.env.test (gitignored)
//      or export them in the shell before running `npm run test:integration`.
//
// Guard rail: refuses to run if SUPABASE_TEST_URL matches NEXT_PUBLIC_SUPABASE_URL.
// ----------------------------------------------------------------------------

const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

export function requireTestEnv() {
  if (!TEST_URL || !TEST_SERVICE_KEY) {
    throw new Error(
      "Integration tests require SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY " +
        "to point at a DEDICATED test Supabase project. See tests/integration/setup.ts for setup steps. " +
        "Refusing to run without them (this suite must never touch production)."
    );
  }
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    TEST_URL === process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    throw new Error(
      "SUPABASE_TEST_URL is the same as NEXT_PUBLIC_SUPABASE_URL (production/dev project). " +
        "Refusing to run integration tests against a non-test database."
    );
  }
  return { url: TEST_URL, key: TEST_SERVICE_KEY };
}

export function testAdminClient(): SupabaseClient {
  const { url, key } = requireTestEnv();
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const ACTIVE_SEASON_ID = 2; // seeded by 20260724000000_season2_phase1_additive.sql

export type TestUser = { id: string; email: string };

/**
 * Creates an auth user (triggers handle_new_user -> profiles row), then
 * seeds a season_players row for the active season, since only the phase-1
 * migration's one-time backfill does this for users that existed at apply
 * time — new signups after that do not get one automatically.
 */
export async function createTestUser(
  admin: SupabaseClient,
  opts: { balance?: number; debt?: number; loanCount?: number } = {}
): Promise<TestUser> {
  const email = `it-${randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: randomUUID(),
    user_metadata: { display_name: `IT ${email.slice(0, 8)}` },
  });
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message}`);
  }
  const id = data.user.id;
  const balance = opts.balance ?? 500;

  const { error: spError } = await admin.from("season_players").upsert(
    {
      season_id: ACTIVE_SEASON_ID,
      user_id: id,
      starting_balance: 500,
      current_balance: balance,
      outstanding_debt: opts.debt ?? 0,
      loan_count: opts.loanCount ?? 0,
      status: "active",
    },
    { onConflict: "season_id,user_id" }
  );
  if (spError) throw new Error(`seed season_players failed: ${spError.message}`);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ current_balance: balance })
    .eq("id", id);
  if (profileError) throw new Error(`sync profile balance failed: ${profileError.message}`);

  return { id, email };
}

export async function deleteTestUser(admin: SupabaseClient, id: string) {
  // Cascades to profiles, bets, transactions, season_players (FKs on delete cascade
  // where declared; season_players.user_id -> profiles.id on delete cascade).
  await admin.auth.admin.deleteUser(id);
}

export type TestMatchOpts = {
  kickoffOffsetMinutes?: number; // relative to now; negative = in the past
  status?: string;
  seasonId?: number;
};

export async function createTestMatch(
  admin: SupabaseClient,
  opts: TestMatchOpts = {}
) {
  const kickoff = new Date(
    Date.now() + (opts.kickoffOffsetMinutes ?? 60) * 60_000
  ).toISOString();

  const { data, error } = await admin
    .from("matches")
    .insert({
      external_match_id: `it-${randomUUID()}`,
      home_team: "Test Home",
      away_team: "Test Away",
      kickoff_time: kickoff,
      status: opts.status ?? "TIMED",
      stage: "英超",
      season_id: opts.seasonId ?? ACTIVE_SEASON_ID,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createTestMatch failed: ${error?.message}`);
  return data.id as string;
}

export async function getSeasonPlayer(
  admin: SupabaseClient,
  userId: string,
  seasonId = ACTIVE_SEASON_ID
) {
  const { data, error } = await admin
    .from("season_players")
    .select("*")
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .single();
  if (error) throw new Error(error.message);
  return data as {
    current_balance: number;
    outstanding_debt: number;
    status: string;
  };
}

export async function getProfile(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("current_balance")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  return data as { current_balance: number };
}

export async function getBet(admin: SupabaseClient, betId: string) {
  const { data, error } = await admin
    .from("bets")
    .select("*")
    .eq("id", betId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getTransactions(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Tracks fixtures created during a test so afterEach/afterAll can clean up. */
export class Fixtures {
  private userIds: string[] = [];
  private matchIds: string[] = [];

  constructor(private admin: SupabaseClient) {}

  async user(opts?: Parameters<typeof createTestUser>[1]) {
    const u = await createTestUser(this.admin, opts);
    this.userIds.push(u.id);
    return u;
  }

  async match(opts?: TestMatchOpts) {
    const id = await createTestMatch(this.admin, opts);
    this.matchIds.push(id);
    return id;
  }

  async cleanup() {
    for (const id of this.userIds) {
      await deleteTestUser(this.admin, id).catch(() => {});
    }
    for (const id of this.matchIds) {
      await this.admin
        .from("matches")
        .delete()
        .eq("id", id)
        .then(
          () => undefined,
          () => undefined
        );
    }
    this.userIds = [];
    this.matchIds = [];
  }
}

export { ACTIVE_SEASON_ID };
