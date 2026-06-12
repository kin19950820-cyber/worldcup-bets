"use server";

import { createClient } from "@/lib/supabase/server";

export async function getDashboardData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, betsRes, matchesRes] = await Promise.all([
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
      .from("matches")
      .select("*")
      .gte("kickoff_time", new Date().toISOString())
      .in("status", ["SCHEDULED", "TIMED"])
      .order("kickoff_time", { ascending: true })
      .limit(5),
  ]);

  const profile = profileRes.data;
  const recentBets = betsRes.data ?? [];
  const upcomingMatches = matchesRes.data ?? [];

  const pendingBets = recentBets.filter((b) => b.status === "pending");
  const pending_stake = pendingBets.reduce((s, b) => s + b.stake, 0);
  const possible_return = pendingBets.reduce((s, b) => s + b.possible_return, 0);

  return { profile, pending_stake, possible_return, recent_bets: recentBets, upcoming_matches: upcomingMatches };
}
