"use client";

import { useState, useTransition } from "react";
import { signIn, signUp } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export default function LoginPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [isPending, startTransition] = useTransition();

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await signIn(fd);
      if (res?.error) toast.error(res.error);
    });
  };

  const handleRegister = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await signUp(fd);
      if (res?.error) toast.error(res.error);
    });
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
          <button
            type="submit"
            disabled={isPending}
            className="btn-primary w-full mt-2"
          >
            {isPending ? "登入中…" : "登入"}
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
          <button
            type="submit"
            disabled={isPending}
            className="btn-primary w-full"
          >
            {isPending ? "建立中…" : "建立帳戶"}
          </button>
        </form>
      )}
    </div>
  );
}
