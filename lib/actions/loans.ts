"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { calculateLoanBalance, roundMoney } from "@/lib/loans";

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

export async function repayMoney(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "還款金額必須大於 HK$0" };
  }

  const roundedAmount = roundMoney(amount);
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "未登入" };

  const { data, error } = await service.rpc("repay_money", {
    p_user_id: user.id,
    p_amount: roundedAmount,
  });

  if (error && error.code !== "PGRST202") {
    return { error: error.message };
  }

  let result = data as
    | {
        new_balance?: number;
        principal?: number;
        accrued_interest?: number;
        total_owed?: number;
      }
    | null;

  if (result?.new_balance === undefined) {
    const [{ data: profile, error: profileReadError }, { data: transactions }] =
      await Promise.all([
        service
          .from("profiles")
          .select("current_balance")
          .eq("id", user.id)
          .single(),
        service
          .from("transactions")
          .select("amount, type, created_at")
          .eq("user_id", user.id)
          .is("bet_id", null)
          .in("type", ["loan", "adjustment", "loan_repayment"])
          .order("created_at", { ascending: true }),
      ]);

    if (profileReadError || !profile) {
      return { error: profileReadError?.message ?? "找不到玩家資料" };
    }

    if (profile.current_balance < roundedAmount) {
      return { error: `餘額不足，現時餘額：HK$${profile.current_balance.toFixed(2)}` };
    }

    const loanBalance = calculateLoanBalance(transactions ?? []);

    if (roundedAmount > loanBalance.totalOwed) {
      return { error: "還款金額不可多於欠款" };
    }

    const newBalance = roundMoney(profile.current_balance - roundedAmount);

    const { error: balanceError } = await service
      .from("profiles")
      .update({ current_balance: newBalance })
      .eq("id", user.id);

    if (balanceError) return { error: balanceError.message };

    const { error: repaymentError } = await service.from("transactions").insert({
      user_id: user.id,
      bet_id: null,
      type: "loan_repayment",
      amount: -roundedAmount,
      balance_after: newBalance,
    });

    if (repaymentError) return { error: repaymentError.message };

    const updatedLoanBalance = calculateLoanBalance([
      ...(transactions ?? []),
      {
        amount: -roundedAmount,
        type: "loan_repayment",
        created_at: new Date().toISOString(),
      },
    ]);

    result = {
      new_balance: newBalance,
      principal: updatedLoanBalance.principal,
      accrued_interest: updatedLoanBalance.accruedInterest,
      total_owed: updatedLoanBalance.totalOwed,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath("/place-bet");

  return {
    success: true,
    amount: roundedAmount,
    newBalance: result.new_balance,
    principal: result.principal,
    accruedInterest: result.accrued_interest,
    totalOwed: result.total_owed,
  };
}
