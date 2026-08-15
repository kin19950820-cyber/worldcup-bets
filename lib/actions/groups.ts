"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type MyGroup = {
  id: string;
  name: string;
  code: string;
  members: { id: string; display_name: string }[];
};

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

// All groups the signed-in player belongs to (with members).
export async function getMyGroups(): Promise<MyGroup[]> {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships, error } = await service
    .from("group_members")
    .select("groups(id, name, code)")
    .eq("user_id", user.id);

  // Fallback: if the group_members migration isn't applied yet, use the legacy
  // single primary group so the UI keeps working.
  if (error) {
    const { data: profile } = await service
      .from("profiles")
      .select("groups(id, name, code)")
      .eq("id", user.id)
      .maybeSingle();
    const g = profile?.groups as unknown as
      | { id: string; name: string; code: string }
      | { id: string; name: string; code: string }[]
      | null;
    const primary = Array.isArray(g) ? g[0] ?? null : g;
    if (!primary) return [];
    return [{ ...primary, members: await legacyMembersOf(service, primary.id) }];
  }

  const groups = (memberships ?? [])
    .map((row) => row.groups as unknown as { id: string; name: string; code: string } | null)
    .filter((g): g is { id: string; name: string; code: string } => g !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return Promise.all(
    groups.map(async (g) => ({
      id: g.id,
      name: g.name,
      code: g.code,
      members: await membersOf(service, g.id),
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

// Every group in the app (for the leaderboard filter and browsing).
export type GroupSummary = { id: string; name: string; member_count: number };

export async function getAllGroups(): Promise<GroupSummary[]> {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: groups } = await service.from("groups").select("id, name");
  if (!groups) return [];

  const counts = new Map<string, number>();
  const { data: members, error } = await service
    .from("group_members")
    .select("group_id");
  if (error) {
    // Fallback to legacy single membership counts.
    const { data: profiles } = await service
      .from("profiles")
      .select("group_id")
      .not("group_id", "is", null);
    for (const p of profiles ?? [])
      counts.set(p.group_id, (counts.get(p.group_id) ?? 0) + 1);
  } else {
    for (const m of members ?? [])
      counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
  }

  return groups
    .map((g) => ({ id: g.id, name: g.name, member_count: counts.get(g.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
