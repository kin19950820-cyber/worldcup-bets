"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  DEFAULT_PRIZE_POOL,
  validatePrizePoolSettings,
  type PrizePoolSettings,
} from "@/lib/prize-pool";

export type MyGroup = {
  id: string;
  name: string;
  code: string;
  // Real-money prize-pool settings (owner-configurable).
  is_owner: boolean;
  buyin_amount: number;
  rebuy_amount: number;
  payout_first: number;
  payout_second: number;
  payout_third: number;
  members: { id: string; display_name: string }[];
};

// Columns to read for a group, including prize-pool settings.
const GROUP_COLS =
  "id, name, code, created_by, buyin_amount, rebuy_amount, payout_first, payout_second, payout_third";

type GroupRow = {
  id: string;
  name: string;
  code: string;
  created_by?: string | null;
  buyin_amount?: number | null;
  rebuy_amount?: number | null;
  payout_first?: number | null;
  payout_second?: number | null;
  payout_third?: number | null;
};

// Fold a raw groups row + the viewer id into a MyGroup shell (no members yet),
// defaulting prize-pool settings when the migration hasn't been applied.
function toGroupShell(row: GroupRow, userId: string): Omit<MyGroup, "members"> {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    is_owner: row.created_by === userId,
    buyin_amount: row.buyin_amount ?? DEFAULT_PRIZE_POOL.buyinAmount,
    rebuy_amount: row.rebuy_amount ?? DEFAULT_PRIZE_POOL.rebuyAmount,
    payout_first: row.payout_first ?? DEFAULT_PRIZE_POOL.payoutFirst,
    payout_second: row.payout_second ?? DEFAULT_PRIZE_POOL.payoutSecond,
    payout_third: row.payout_third ?? DEFAULT_PRIZE_POOL.payoutThird,
  };
}

// Normalise a user-chosen group code: uppercase A-Z/0-9, 4–10 chars.
function normalizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,10}$/.test(code) ? code : null;
}

async function membersOf(
  service: ReturnType<typeof createServiceClient>,
  groupId: string
) {
  const { data } = await service
    .from("group_members")
    .select("profiles(id, display_name)")
    .eq("group_id", groupId);
  return (data ?? [])
    .map((row) => row.profiles as unknown as { id: string; display_name: string } | null)
    .filter((p): p is { id: string; display_name: string } => p !== null)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

function extractGroups(
  data: { groups: unknown }[] | null
): GroupRow[] {
  return (data ?? [])
    .map((row) => row.groups as unknown as GroupRow | null)
    .filter((g): g is GroupRow => g !== null);
}

// All groups the signed-in player belongs to (with members + pool settings).
export async function getMyGroups(): Promise<MyGroup[]> {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Preferred: membership join with full prize-pool columns. Degrade gracefully
  // if the pool columns (or the group_members table) aren't migrated yet.
  let rows: GroupRow[] | null = null;

  const full = await service
    .from("group_members")
    .select(`groups(${GROUP_COLS})`)
    .eq("user_id", user.id);
  if (!full.error) {
    rows = extractGroups(full.data);
  } else {
    const basic = await service
      .from("group_members")
      .select("groups(id, name, code, created_by)")
      .eq("user_id", user.id);
    if (!basic.error) rows = extractGroups(basic.data);
  }

  // group_members table itself is missing — legacy single-group fallback.
  if (rows === null) {
    const { data: profile } = await service
      .from("profiles")
      .select("groups(id, name, code, created_by)")
      .eq("id", user.id)
      .maybeSingle();
    const g = profile?.groups as unknown as GroupRow | GroupRow[] | null;
    const primary = Array.isArray(g) ? g[0] ?? null : g;
    if (!primary) return [];
    return [
      {
        ...toGroupShell(primary, user.id),
        members: await legacyMembersOf(service, primary.id),
      },
    ];
  }

  const shells = rows.sort((a, b) => a.name.localeCompare(b.name));

  return Promise.all(
    shells.map(async (row) => ({
      ...toGroupShell(row, user.id),
      members: await membersOf(service, row.id),
    }))
  );
}

// Members via the legacy profiles.group_id pointer (pre-migration fallback).
async function legacyMembersOf(
  service: ReturnType<typeof createServiceClient>,
  groupId: string
) {
  const { data } = await service
    .from("profiles")
    .select("id, display_name")
    .eq("group_id", groupId)
    .order("display_name");
  return data ?? [];
}

// Create a group with a chosen name AND code, then join it.
export async function createGroup(name: string, code: string) {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "請輸入群組名稱" };
  if (trimmed.length > 40) return { error: "群組名稱太長" };

  const normalized = normalizeCode(code);
  if (!normalized) return { error: "代碼須為 4–10 位英文字母或數字" };

  const { data: group, error } = await service
    .from("groups")
    .insert({ name: trimmed, code: normalized, created_by: user.id })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "此群組代碼已被使用，請換一個" };
    return { error: error.message };
  }

  await service
    .from("group_members")
    .insert({ group_id: group.id, user_id: user.id });
  await service.from("profiles").update({ group_id: group.id }).eq("id", user.id);

  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  return { success: true, code: normalized };
}

// Join an existing group by code — adds a membership without leaving others.
export async function joinGroup(code: string) {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const normalized = normalizeCode(code);
  if (!normalized) return { error: "請輸入正確的群組代碼" };

  const { data: group } = await service
    .from("groups")
    .select("id")
    .eq("code", normalized)
    .maybeSingle();
  if (!group) return { error: "找不到此群組代碼" };

  const { error } = await service
    .from("group_members")
    .insert({ group_id: group.id, user_id: user.id });
  if (error) {
    if (error.code === "23505") return { error: "你已加入此群組" };
    return { error: error.message };
  }

  await service.from("profiles").update({ group_id: group.id }).eq("id", user.id);
  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  return { success: true };
}

// Owner-only: set the group's real-money buy-in amounts and 冠/亞/季 split.
export async function updateGroupSettings(
  groupId: string,
  settings: PrizePoolSettings
) {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const invalid = validatePrizePoolSettings(settings);
  if (invalid) return { error: invalid };

  // Only the group creator may change the pool settings.
  const { data: group } = await service
    .from("groups")
    .select("created_by")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return { error: "找不到此群組" };
  if (group.created_by !== user.id) return { error: "只有群組建立者可設定彩池" };

  const { error } = await service
    .from("groups")
    .update({
      buyin_amount: settings.buyinAmount,
      rebuy_amount: settings.rebuyAmount,
      payout_first: settings.payoutFirst,
      payout_second: settings.payoutSecond,
      payout_third: settings.payoutThird,
    })
    .eq("id", groupId);
  if (error) {
    if (error.code === "42703") {
      return { error: "資料庫尚未套用彩池遷移，請聯絡管理員" };
    }
    return { error: error.message };
  }

  revalidatePath("/leaderboard");
  return { success: true };
}

// Leave one specific group.
export async function leaveGroup(groupId: string) {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  await service
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id);

  // Keep the primary pointer valid: point at any remaining group, else null.
  const { data: remaining } = await service
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .limit(1);
  await service
    .from("profiles")
    .update({ group_id: remaining?.[0]?.group_id ?? null })
    .eq("id", user.id);

  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  return { success: true };
}
