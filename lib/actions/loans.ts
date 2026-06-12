"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const REQUIRED_CONFIRMATION = "我同意";

export async function borrowMoney(
  amount: number,
  confirmations: string[]
) {
  if (
    confirmations.length !== 3 ||
    confirmations.some((value) => value.trim() !== REQUIRED_CONFIRMATION)
  ) {
    return { error: "三次確認未完成，借款取消" };
  }

  if (!Number.isFinite(amount) || amount < 1 || amount >= 2000) {
    return { error: "借款金額必須少於 HK$2,000" };
  }

  const roundedAmount = Math.round(amount * 100) / 100;
  const supabase = await createClient();
  const service = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "未登入" };

  const { data, error } = await service.rpc("borrow_money", {
    p_user_id: user.id,
    p_amount: roundedAmount,
  });

  if (error && error.code !== "PGRST202") {
    return { error: error.message };
  }

  let newBalance = (data as { new_balance?: number } | null)?.new_balance;

  // Compatibility path until the loan migration is applied.
  if (newBalance === undefined) {
    const { data: profile, error: profileReadError } = await service
      .from("profiles")
      .select("current_balance")
      .eq("id", user.id)
      .single();

    if (profileReadError || !profile) {
      return { error: profileReadError?.message ?? "找不到玩家資料" };
    }

    newBalance = Math.round((profile.current_balance + roundedAmount) * 100) / 100;

    const { error: balanceError } = await service
      .from("profiles")
      .update({ current_balance: newBalance })
      .eq("id", user.id);

    if (balanceError) return { error: balanceError.message };

    const transaction = {
      user_id: user.id,
      bet_id: null,
      type: "loan",
      amount: roundedAmount,
      balance_after: newBalance,
    };
    const { error: loanError } = await service
      .from("transactions")
      .insert(transaction);

    if (loanError?.code === "23514") {
      const { error: adjustmentError } = await service
        .from("transactions")
        .insert({ ...transaction, type: "adjustment" });
      if (adjustmentError) return { error: adjustmentError.message };
    } else if (loanError) {
      return { error: loanError.message };
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath("/place-bet");

  return {
    success: true,
    amount: roundedAmount,
    newBalance,
  };
}
