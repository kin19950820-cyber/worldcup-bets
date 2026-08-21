"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveSeason, getSeason } from "@/lib/seasons";
import { SEASON2_STARTING_BALANCE, SEASON2_LOAN } from "@/lib/season2-loans";

// Cash-affecting transaction types shown on the fund-trend chart (both the old
// tiered types and the Season 2 flat-loan types; rows are season-filtered).
const FUND_TREND_TRANSACTION_TYPES = [
  "initial_fund",
  "payout",
  "refund",
  "loan",
  "adjustment",
  "loan_repayment",
  "loan_principal",
  "debt_repayment",
  "admin_adjustment",
];

export async function getDashboardData() {
  const supabase = await createClient();
  const service = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const seasonId = getActiveSeason().id;

  const [
    profileRes,
    betsRes,
    pendingBetsRes,
    matchesRes,
    historyRes,
    loanEventsRes,
    seasonPlayerRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("bets")
      .select(
        "*, matches(home_team, away_team, kickoff_time, stage, status, score_home, score_away)"
      )
      .eq("user_id", user.id)
      .eq("season_id", seasonId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("bets")
      .select("stake, possible_return")
      .eq("user_id", user.id)
      .eq("season_id", seasonId)
      .eq("status", "pending"),
    supabase
      .from("matches")
      .select("*")
      .eq("season_id", seasonId)
      .gte("kickoff_time", new Date().toISOString())
      .in("status", ["SCHEDULED", "TIMED"])
      .order("kickoff_time", { ascending: true })
      .limit(5),
    // Fund-trend points: this season's cash-affecting transactions.
    supabase
      .from("transactions")
      .select("amount, type, balance_after, created_at")
      .eq("user_id", user.id)
      .eq("season_id", seasonId)
      .in("type", FUND_TREND_TRANSACTION_TYPES)
      .order("created_at", { ascending: true }),
    // Season 2 loan events, to reconstruct outstanding debt over time.
    supabase
      .from("transactions")
      .select("amount, type, created_at")
      .eq("user_id", user.id)
      .eq("season_id", seasonId)
      .in("type", ["loan_principal", "debt_repayment"])
      .order("created_at", { ascending: true }),
    service
      .from("season_players")
      .select("starting_balance, current_balance, outstanding_debt")
      .eq("user_id", user.id)
      .eq("season_id", seasonId)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const recentBets = betsRes.data ?? [];
  const upcomingMatches = matchesRes.data ?? [];

  const pendingBets = pendingBetsRes.data ?? [];
  const pending_stake = pendingBets.reduce((s, b) => s + b.stake, 0);
  const possible_return = pendingBets.reduce((s, b) => s + b.possible_return, 0);

  const seasonPlayer = seasonPlayerRes.data;
  const startingBalance =
    seasonPlayer?.starting_balance ?? SEASON2_STARTING_BALANCE;
  const seasonStart = getSeason(seasonId)?.start ?? profile?.created_at ?? null;

  // Reconstruct flat Season 2 debt at any point in time from loan events.
  const loanEvents = loanEventsRes.data ?? [];
  const debtAt = (iso: string) => {
    const t = new Date(iso).getTime();
    let debt = 0;
    for (const event of loanEvents) {
      if (new Date(event.created_at).getTime() > t) break;
      if (event.type === "loan_principal") debt += SEASON2_LOAN.debt;
      else if (event.type === "debt_repayment") debt -= Math.abs(event.amount);
    }
    return Math.max(0, Math.round(debt * 100) / 100);
  };
  const currentDebt =
    seasonPlayer?.outstanding_debt != null
      ? Number(seasonPlayer.outstanding_debt)
      : debtAt(new Date().toISOString());

  const balance_history = [
    {
      balance: startingBalance,
      net_balance: startingBalance,
      outstanding_loan: 0,
      created_at: seasonStart ?? new Date().toISOString(),
    },
    ...(historyRes.data ?? []).map((transaction) => {
      const outstandingLoan = debtAt(transaction.created_at);
      return {
        balance: transaction.balance_after,
        net_balance: transaction.balance_after - outstandingLoan,
        outstanding_loan: outstandingLoan,
        created_at: transaction.created_at,
      };
    }),
  ];

  return {
    profile,
    pending_stake,
    possible_return,
    total_borrowed: currentDebt,
    loan_principal: currentDebt,
    loan_interest: 0,
    loan_effective_weekly_rate: 0,
    balance_history,
    recent_bets: recentBets,
    upcoming_matches: upcomingMatches,
  };
}
