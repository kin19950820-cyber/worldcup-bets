"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// Avoids visually ambiguous characters (0/O, 1/I).
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export type MyGroup = {
  id: string;
  name: string;
  code: string;
  members: { id: string; display_name: string }[];
};

export async function getMyGroup(): Promise<MyGroup | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("groups(id, name, code)")
    .eq("id", user.id)
    .maybeSingle();

  const groups = profile?.groups as unknown as
    | { id: string; name: string; code: string }[]
    | { id: string; name: string; code: string }
    | null;
  const group = Array.isArray(groups) ? groups[0] ?? null : groups;
  if (!group) return null;

  const { data: members } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("group_id", group.id)
    .order("display_name");

  return { id: group.id, name: group.name, code: group.code, members: members ?? [] };
}

export async function createGroup(name: string) {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "請輸入群組名稱" };
  if (trimmed.length > 40) return { error: "群組名稱太長" };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { data: group, error } = await service
      .from("groups")
      .insert({ name: trimmed, code, created_by: user.id })
      .select("id")
      .single();

    if (!error && group) {
      const { error: membershipError } = await service
        .from("profiles")
        .update({ group_id: group.id })
        .eq("id", user.id);
      if (membershipError) {
        // Best-effort cleanup: do not report success with an orphaned group.
        await service
          .from("groups")
          .delete()
          .eq("id", group.id)
          .eq("created_by", user.id);
        return { error: membershipError.message };
      }
      revalidatePath("/leaderboard");
      revalidatePath("/dashboard");
      return { success: true };
    }
    // Retry on a code collision only; anything else is a real failure.
    if (error && error.code !== "23505") return { error: error.message };
  }
  return { error: "建立群組失敗，請重試" };
}

export async function joinGroup(code: string) {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { error: "請輸入群組代碼" };

  const { data: group } = await service
    .from("groups")
    .select("id")
    .eq("code", trimmed)
    .maybeSingle();
  if (!group) return { error: "找不到此群組代碼" };

  const { error: membershipError } = await service
    .from("profiles")
    .update({ group_id: group.id })
    .eq("id", user.id);
  if (membershipError) return { error: membershipError.message };
  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function leaveGroup() {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const { error } = await service
    .from("profiles")
    .update({ group_id: null })
    .eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  return { success: true };
}
