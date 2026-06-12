"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, formatCurrency } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth";
import { useState, useTransition } from "react";

interface NavbarProps {
  displayName: string;
  role: string;
  balance: number;
}

const navItems = [
  { href: "/dashboard", label: "主頁", icon: "🏠" },
  { href: "/matches", label: "賽事", icon: "⚽" },
  { href: "/place-bet", label: "落注", icon: "➕", highlight: true },
  { href: "/leaderboard", label: "龍虎榜", icon: "🏆" },
  { href: "/bets-board", label: "投注版", icon: "📋" },
];

const adminItems = [
  { href: "/admin/settle", label: "結算", icon: "⚖️" },
  { href: "/admin/matches", label: "管理", icon: "🔄" },
];

export default function Navbar({ displayName, role, balance }: NavbarProps) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    startTransition(async () => {
      await signOut();
    });
  };

  const isAdmin = role === "admin";

  return (
    <>
      {/* Desktop Top Bar */}
      <header className="hidden md:flex fixed top-0 inset-x-0 z-50 h-16 bg-slate-900 border-b border-slate-800 items-center px-6 gap-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-white shrink-0">
          <span className="text-xl">⚽</span>
          <span className="text-sm">世界盃投注</span>
        </Link>

        <nav className="flex items-center gap-1 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-brand-500/20 text-brand-400"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              {item.icon} {item.label}
            </Link>
          ))}
          {isAdmin &&
            adminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10"
                )}
              >
                {item.icon} {item.label}
              </Link>
            ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-xs text-slate-500">{displayName}</p>
            <p className="text-sm font-bold text-brand-400">{formatCurrency(balance)}</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={isPending}
            className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            登出
          </button>
        </div>
      </header>

      {/* Mobile Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-slate-900 border-t border-slate-800 safe-area-pb">
        <div className="flex items-center">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors",
                item.highlight
                  ? pathname === item.href
                    ? "text-brand-400"
                    : "text-brand-500"
                  : pathname === item.href
                  ? "text-brand-400"
                  : "text-slate-500"
              )}
            >
              <span className={cn("text-xl leading-none", item.highlight && "bg-brand-500 text-white rounded-full w-10 h-10 flex items-center justify-center mb-0.5 shadow-lg shadow-brand-500/30")}>
                {item.icon}
              </span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          ))}

          {/* Mobile: show menu button for admin or profile */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5",
              menuOpen ? "text-white" : "text-slate-500"
            )}
          >
            <span className="text-xl leading-none">👤</span>
            <span className="text-[10px] font-medium">我</span>
          </button>
        </div>
      </nav>

      {/* Mobile slide-up menu */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="absolute bottom-20 inset-x-4 bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <p className="font-semibold text-white">{displayName}</p>
                <p className="text-sm text-brand-400 font-bold">{formatCurrency(balance)}</p>
              </div>
              {isAdmin && (
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
                  管理員
                </span>
              )}
            </div>

            {isAdmin && (
              <>
                {adminItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 text-amber-400 py-2 text-sm font-medium"
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
                <div className="border-t border-slate-800" />
              </>
            )}

            <button
              onClick={handleLogout}
              disabled={isPending}
              className="w-full text-left text-red-400 py-2 text-sm font-medium flex items-center gap-3"
            >
              <span>🚪</span>
              <span>{isPending ? "登出中…" : "登出"}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
