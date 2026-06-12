import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/nav/Navbar";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, current_balance")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-dvh flex flex-col">
      <Navbar
        displayName={profile?.display_name ?? ""}
        role={profile?.role ?? "player"}
        balance={profile?.current_balance ?? 0}
      />
      {/* main content — pb-20 on mobile to clear bottom nav */}
      <main className="flex-1 pb-20 md:pb-0 md:pt-16">
        {children}
      </main>
    </div>
  );
}
