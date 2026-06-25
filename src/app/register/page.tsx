"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      router.push("/projects");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="studio-shell studio-workbench flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center">
          <p className="studio-label">Video Prompt Studio</p>
          <h1 className="mt-2 text-2xl font-bold">创建账号</h1>
          <p className="mt-2 text-sm text-gray-600">用于保存项目、API 设置和生成记录。</p>
        </div>
        <div className="studio-auth-card studio-card studio-panel-in p-8">
          <p className="studio-label mb-5">ACCOUNT SETUP</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@company.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="至少 6 位"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block">确认密码</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                placeholder="再次输入密码"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
              />
            </div>
            {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="studio-button studio-primary w-full px-4 py-2 text-white disabled:opacity-50"
            >
              {loading ? "注册中..." : "创建并进入工作台"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-600">
            已有账号？{" "}
            <Link href="/login" className="font-semibold text-rose-700 hover:underline">
              登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
