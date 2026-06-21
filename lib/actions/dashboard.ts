"use server";

import { createClient } from "@/lib/supabase/server";
import { calculateLoanBalance } from "@/lib/loans";

export async function getDashboardData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, betsRes, pendingBetsRes, matchesRes, loansRes, historyRes] =
    await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("bets")
      .select(
        "*, matches(home_team, away_team, kickoff_time, stage, status, score_home, score_away)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("bets")
      .select("stake, possible_return")
      .eq("user_id", user.id)
      .eq("status", "pending"),
    supabase
      .from("matches")
      .select("*")
      .gte("kickoff_time", new Date().toISOString())
      .in("status", ["SCHEDULED", "TIMED"])
      .order("kickoff_time", { ascending: true })
      .limit(5),
    supabase
      .from("transactions")
      .select("amount, type, created_at")
      .eq("user_id", user.id)
      .is("bet_id", null)
      .in("type", ["loan", "adjustment", "loan_repayment"])
      .order("created_at", { ascending: true }),
    supabase
      .from("transactions")
      .select("balance_after, created_at")
      .eq("user_id", user.id)
      .neq("type", "stake_deduct")
      .order("created_at", { ascending: true }),
    ]);

  const profile = profileRes.data;
  const recentBets = betsRes.data ?? [];
  const upcomingMatches = matchesRes.data ?? [];

  const pendingBets = pendingBetsRes.data ?? [];
  const pending_stake = pendingBets.reduce((s, b) => s + b.stake, 0);
  const possible_return = pendingBets.reduce((s, b) => s + b.possible_return, 0);
  const loan_balance = calculateLoanBalance(loansRes.data ?? []);
  const balance_history = [
    {
      balance: profile?.starting_fund ?? 0,
      created_at: profile?.created_at ?? new Date().toISOString(),
    },
    ...(historyRes.data ?? []).map((transaction) => ({
      balance: transaction.balance_after,
      created_at: transaction.created_at,
    })),
  ];

  return {
    profile,
    pending_stake,
    possible_return,
    total_borrowed: loan_balance.totalOwed,
    loan_principal: loan_balance.principal,
    loan_interest: loan_balance.accruedInterest,
    loan_effective_weekly_rate: loan_balance.effectiveWeeklyRate,
    balance_history,
    recent_bets: recentBets,
    upcoming_matches: upcomingMatches,
  };
}
