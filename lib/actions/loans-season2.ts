"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveSeason } from "@/lib/seasons";
import { loanEligibility } from "@/lib/season2-loans";

// Maps RPC exception codes → zh-Hant messages.
const RPC_ERRORS: Record<string, string> = {
  SEASON_PLAYER_MISSING: "找不到本季玩家資料",
  LOAN_LIMIT_REACHED: "本季借款次數已用完",
  DEBT_OUTSTANDING: "請先清還現有欠款",
  BALANCE_TOO_HIGH: "現時餘額須為 $100 或以下才可借款",
  NOT_ADMIN: "權限不足",
  REQUEST_NOT_FOUND: "找不到借款申請",
  REQUEST_NOT_PENDING: "此申請已處理",
};

function mapRpcError(message: string | undefined): string {
  if (!message) return "操作失敗";
  const code = Object.keys(RPC_ERRORS).find((key) => message.includes(key));
  if (code) return RPC_ERRORS[code];
  if (message.includes("PGRST202")) {
    return "資料庫尚未套用 Season 2 遷移，請聯絡管理員";
  }
  return message;
}

// Player requests a $500 loan for the active season. The RPC re-checks
// eligibility under a row lock; the unique pending-request index prevents
// duplicate concurrent requests.
export async function requestSeason2Loan() {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const activeId = getActiveSeason().id;

  // Fast client-side eligibility check for a friendly message (authoritative
  // check still happens in the RPC).
  const { data: sp } = await service
    .from("season_players")
    .select("current_balance, outstanding_debt, loan_count")
    .eq("user_id", user.id)
    .eq("season_id", activeId)
    .maybeSingle();
  if (sp) {
    const check = loanEligibility({
      currentBalance: sp.current_balance,
      outstandingDebt: sp.outstanding_debt,
      loanCount: sp.loan_count,
    });
    if (!check.allowed) return { error: check.reason };
  }

  const { error } = await service.rpc("request_loan", { p_user_id: user.id });
  if (error) return { error: mapRpcError(error.message) };

  revalidatePath("/dashboard");
  return { success: true };
}

export async function approveSeason2Loan(requestId: string) {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (adminProfile?.role !== "admin") return { error: "權限不足" };

  const { data, error } = await service.rpc("approve_loan", {
    p_request_id: requestId,
    p_admin_id: user.id,
  });
  if (error) return { error: mapRpcError(error.message) };

  revalidatePath("/admin/loans");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  return { success: true, ...(data as Record<string, unknown>) };
}

export async function rejectSeason2Loan(requestId: string, reason: string) {
  const supabase = await createClient();
  const service = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (adminProfile?.role !== "admin") return { error: "權限不足" };

  const { error } = await service.rpc("reject_loan", {
    p_request_id: requestId,
    p_admin_id: user.id,
    p_reason: reason || "不符合借款資格",
  });
  if (error) return { error: mapRpcError(error.message) };

  revalidatePath("/admin/loans");
  return { success: true };
}
