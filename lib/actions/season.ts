"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveSeason, getSeason, SEASONS } from "@/lib/seasons";
import { loanEligibility, roundMoney } from "@/lib/season2-loans";

export type SeasonPlayerRow = {
  season_id: number;
  user_id: string;
  starting_balance: number;
  current_balance: number;
  outstanding_debt: number;
  loan_count: number;
  status: string;
};

// The signed-in player's state for a given season (defaults to active season).
export async function getSeasonState(seasonId = getActiveSeason().id) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("season_players")
    .select(
      "season_id, user_id, starting_balance, current_balance, outstanding_debt, loan_count, status"
    )
    .eq("user_id", user.id)
    .eq("season_id", seasonId)
    .maybeSingle();

  const row = (data as SeasonPlayerRow | null) ?? null;

  // Pending stake (open bets) for this season, for net-worth display.
  const { data: pending } = await supabase
    .from("bets")
    .select("stake")
    .eq("user_id", user.id)
    .eq("season_id", seasonId)
    .eq("status", "pending");
  const pendingStake = roundMoney(
    (pending ?? []).reduce((sum, bet) => sum + Number(bet.stake), 0)
  );

  const startingBalance = row?.starting_balance ?? 500;
  const currentBalance = row?.current_balance ?? startingBalance;
  const outstandingDebt = row?.outstanding_debt ?? 0;
  const loanCount = row?.loan_count ?? 0;
  const netWorth = roundMoney(currentBalance + pendingStake - outstandingDebt);

  return {
    seasonId,
    startingBalance,
    currentBalance,
    outstandingDebt,
    loanCount,
    pendingStake,
    netWorth,
    profitLoss: roundMoney(netWorth - startingBalance),
    eligibility: loanEligibility({ currentBalance, outstandingDebt, loanCount }),
    hasRow: row !== null,
  };
}

// Seasons the UI may show, newest first. All are viewable; only the active one
// is writable.
export async function getViewableSeasons() {
  return [...SEASONS]
    .sort((a, b) => b.id - a.id)
    .map((season) => ({ id: season.id, name: season.name, ended: season.ended }));
}

// Admin: pending loan requests for the active season, with the requesting
// player's live state so the admin can see eligibility at a glance.
export async function getPendingLoanRequests() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { requests: [] };

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (adminProfile?.role !== "admin") return { requests: [] };

  const service = createServiceClient();
  const activeId = getActiveSeason().id;
  const { data } = await service
    .from("loan_requests")
    .select(
      "id, user_id, amount, fee, requested_at, profiles(display_name), season_players!inner(current_balance, outstanding_debt, loan_count)"
    )
    .eq("season_id", activeId)
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  return { requests: data ?? [], seasonName: getSeason(activeId)?.name };
}
