"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export default function LoginPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      toast.error(error.message.includes("Invalid") ? "電郵或密碼錯誤" : error.message);
    } else {
      // Full-page navigation — avoids Next.js RSC headers which can fail with
      // non-ISO-8859-1 characters when the router state tree is serialized.
      window.location.href = "/dashboard";
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;
    const displayName = (fd.get("display_name") as string)?.trim();

    if (!displayName || displayName.length < 2) {
      toast.error("名字至少要2個字");
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      toast.error("密碼至少要6個字元");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });

    if (error) {
      setLoading(false);
      toast.error(error.message.includes("already") ? "此電郵已被使用" : error.message);
    } else {
      toast.success("帳戶已建立！");
      window.location.href = "/dashboard";
    }
  };

  return (
    <div className="card p-6">
      {/* Tabs */}
      <div className="flex bg-slate-800 rounded-xl p-1 mb-6">
        <button
          onClick={() => setTab("login")}
          className={cn(
            "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
            tab === "login"
              ? "bg-slate-600 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          登入
        </button>
        <button
          onClick={() => setTab("register")}
          className={cn(
            "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
            tab === "register"
              ? "bg-slate-600 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          新登記
        </button>
      </div>

      {/* Login Form */}
      {tab === "login" && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="form-label">電郵</label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="your@email.com"
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">密碼</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••"
              className="form-input"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? "登入中…" : "登入"}
          </button>
        </form>
      )}

      {/* Register Form */}
      {tab === "register" && (
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="form-label">名字（顯示用）</label>
            <input
              name="display_name"
              type="text"
              required
              autoComplete="nickname"
              placeholder="你嘅名字"
              maxLength={20}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">電郵</label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="your@email.com"
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">密碼（最少6個字元）</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="••••••••"
              minLength={6}
              className="form-input"
            />
          </div>
          <p className="text-xs text-slate-500 bg-slate-800 rounded-lg p-3">
            🎁 新用戶即獲 <span className="text-brand-500 font-semibold">HK$500</span> 虛擬籌碼
          </p>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "建立中…" : "建立帳戶"}
          </button>
        </form>
      )}
    </div>
  );
}
