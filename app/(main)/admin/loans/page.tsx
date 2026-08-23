import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPendingLoanRequests } from "@/lib/actions/season";
import LoanRequestList from "@/components/admin/LoanRequestList";

export const dynamic = "force-dynamic";

export default async function AdminLoansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { requests, seasonName } = await getPendingLoanRequests();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold text-white">
        💸 買入批核
      </h1>
      <p className="mb-6 text-sm text-slate-400">
        {seasonName ?? "本季"} · 每筆固定買入 $500（欠 $500，免手續費）；買入次數無限
      </p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <LoanRequestList requests={(requests as any) ?? []} />
    </div>
  );
}
