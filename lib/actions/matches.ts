"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isMatchBettable } from "@/lib/match-status";

export async function getUpcomingMatches() {
  const supabase = await createClient();
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 3);

  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .gte("kickoff_time", cutoff.toISOString())
    .order("kickoff_time", { ascending: true });

  if (error) return { matches: [], error: error.message };
  return { matches: (data ?? []).filter((match) => isMatchBettable(match)) };
}

export async function getAllMatches() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_time", { ascending: true });

  if (error) return { matches: [], error: error.message };
  return { matches: data ?? [] };
}

export async function syncMatches() {
  const service = createServiceClient();
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) return { error: "未配置 FOOTBALL_API_KEY" };

  try {
    // football-data.org v4 API — WC competition
    const res = await fetch(
      "https://api.football-data.org/v4/competitions/WC/matches",
      {
        headers: { "X-Auth-Token": apiKey },
        next: { revalidate: 0 },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      return { error: `API 錯誤 ${res.status}: ${body.slice(0, 200)}` };
    }

    const json = await res.json();
    const matches: Record<string, unknown>[] = json.matches ?? [];

    let synced = 0;
    let failed = 0;

    for (const m of matches) {
      const homeTeam = (m.homeTeam as Record<string, string>)?.shortName
        || (m.homeTeam as Record<string, string>)?.name
        || "TBD";
      const awayTeam = (m.awayTeam as Record<string, string>)?.shortName
        || (m.awayTeam as Record<string, string>)?.name
        || "TBD";
      const score = m.score as Record<string, Record<string, number | null>> | undefined;

      const { error } = await service.from("matches").upsert(
        {
          external_match_id: String(m.id),
          home_team: homeTeam,
          away_team: awayTeam,
          kickoff_time: m.utcDate as string,
          stage: (m.stage as string) ?? null,
          group_name: (m.group as string) ?? null,
          status: (m.status as string) ?? "SCHEDULED",
          score_home: score?.fullTime?.home ?? null,
          score_away: score?.fullTime?.away ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "external_match_id" }
      );

      if (error) failed++;
      else synced++;
    }

    return { success: true, synced, failed, total: matches.length };
  } catch (e) {
    return { error: `同步失敗：${String(e)}` };
  }
}

export async function syncSpecialMarkets() {
  const service = createServiceClient();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "權限不足" };

  const { getOutrightMarketsForSync } = await import("@/lib/actions/odds");
  const markets = await getOutrightMarketsForSync();

  if (markets.length === 0) {
    return { error: "馬會暫時沒有可同步的特別項目賠率" };
  }

  // Keep special markets bettable until HKJC suspends them; fall back to a
  // far-future kickoff when no suspend time is provided.
  const fallbackKickoff = new Date(
    Date.now() + 60 * 24 * 60 * 60 * 1000
  ).toISOString();

  let synced = 0;
  let failed = 0;
  for (const market of markets) {
    const { error } = await service.from("matches").upsert(
      {
        external_match_id: market.externalId,
        home_team: market.marketName,
        away_team: market.tournamentName,
        kickoff_time: market.suspendAt ?? fallbackKickoff,
        stage: "特別項目",
        status: "SCHEDULED",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "external_match_id" }
    );
    if (error) failed++;
    else synced++;
  }

  return { success: true, synced, failed, total: markets.length };
}

export async function addMatchManually(formData: FormData) {
  const service = createServiceClient();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { error: "權限不足" };

  const home_team = (formData.get("home_team") as string)?.trim();
  const away_team = (formData.get("away_team") as string)?.trim();
  const kickoff_time = formData.get("kickoff_time") as string;
  const stage = (formData.get("stage") as string)?.trim() || null;

  if (!home_team || !away_team || !kickoff_time)
    return { error: "請填寫主隊、客隊及開賽時間" };

  const external_id = `manual_${Date.now()}`;

  const { error } = await service.from("matches").insert({
    external_match_id: external_id,
    home_team,
    away_team,
    kickoff_time: new Date(kickoff_time).toISOString(),
    stage,
    status: "SCHEDULED",
  });

  if (error) return { error: error.message };
  return { success: true };
}
