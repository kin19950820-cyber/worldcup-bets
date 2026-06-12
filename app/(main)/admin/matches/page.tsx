import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllMatches } from "@/lib/actions/matches";
import AdminMatchManager from "@/components/admin/AdminMatchManager";

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  const { matches } = await getAllMatches();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
        🔄 賽事管理
      </h1>
      <p className="text-slate-400 text-sm mb-6">同步 API 賽程 / 手動新增賽事</p>
      <AdminMatchManager initialMatches={matches} />
    </div>
  );
}
