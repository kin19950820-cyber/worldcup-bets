"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "請填寫電郵及密碼" };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.includes("Invalid login credentials"))
      return { error: "電郵或密碼錯誤" };
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  // Return success — let client router navigate so cookies are flushed first
  return { success: true };
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const displayName = formData.get("display_name") as string;

  if (!email || !password || !displayName) return { error: "請填寫所有欄位" };
  if (displayName.trim().length < 2) return { error: "名字至少要2個字" };
  if (password.length < 6) return { error: "密碼至少要6個字元" };

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName.trim() } },
  });

  if (error) {
    if (error.message.includes("already registered"))
      return { error: "此電郵已被使用" };
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function getSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
}
