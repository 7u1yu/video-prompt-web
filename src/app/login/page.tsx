"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      router.push("/projects");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function showProviderNotice(provider: string) {
    setError("");
    setNotice(`${provider} 登录入口已预留，当前版本还未接入 OAuth。请先使用邮箱和密码登录。`);
  }

  return (
    <div className="studio-shell studio-auth studio-workbench flex min-h-screen items-center justify-center px-4 py-10">
      <div className="relative z-10 grid w-full max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <section className="studio-auth-side hidden lg:block">
          <p className="studio-label">VIDEO PROMPT STUDIO</p>
          <h1 className="mt-4 max-w-xl text-5xl font-bold leading-tight text-[#1a1a1b]">
            专业 AI 视频创作控制台
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-gray-600">
            面向短剧、漫剧和电影分镜创作者。登录后继续管理项目、配置模型供应商、生成完整视频 Prompt 与参考素材。
          </p>
          <div className="mt-8 max-w-xl space-y-3">
            <div className="studio-card-quiet p-4">
              <div className="flex items-center justify-between">
                <span className="studio-label">SCENE</span>
                <span className="studio-chip">READY</span>
              </div>
              <div className="mt-4 h-2 rounded-full bg-gray-100">
                <div className="h-2 w-4/5 rounded-full bg-[#1a1a1b]" />
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-600">漫剧 / 真人剧 / 电影场景流已就绪</p>
            </div>
            <div className="studio-card-quiet p-4">
              <div className="flex items-center justify-between">
                <span className="studio-label">ASSETS</span>
                <span className="studio-data text-xs text-gray-500">IMG / VID / VOICE</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="h-16 rounded-md border border-gray-200 bg-white" />
                <div className="h-16 rounded-md border border-gray-200 bg-white" />
                <div className="h-16 rounded-md border border-gray-200 bg-white" />
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-600">参考图、视频、人物音色参考独立管理</p>
            </div>
            <div className="studio-card-quiet p-4">
              <div className="flex items-center justify-between">
                <span className="studio-label">MODEL ROUTER</span>
                <span className="studio-chip">ONLINE</span>
              </div>
              <p className="studio-data mt-3 text-sm text-gray-800">OpenAI / DeepSeek / Qwen / Doubao / Custom</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">支持在网页内切换文本模型和图片模型供应商</p>
            </div>
          </div>
        </section>

        <div className="w-full">
          <div className="mb-5 text-center lg:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Video Prompt Studio</p>
            <h1 className="mt-2 text-2xl font-bold">登录工作台</h1>
            <p className="mt-2 text-sm text-gray-600">进入项目库，继续生成分镜 Prompt 和参考图 Prompt。</p>
          </div>
          <div className="studio-auth-card studio-card studio-auth-form p-6 sm:p-8">
            <div className="mb-6">
              <p className="studio-label">SIGN IN</p>
              <h2 className="mt-2 text-2xl font-bold">进入工作台</h2>
              <p className="mt-2 text-sm text-gray-600">选择登录方式，继续你的 Prompt 项目。</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => showProviderNotice("Google")} className="studio-social-button">
                <span className="studio-social-mark">G</span>
                Google 邮箱
              </button>
              <button type="button" onClick={() => showProviderNotice("GitHub")} className="studio-social-button">
                <span className="studio-social-mark">GH</span>
                GitHub
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">OAuth 未接入，当前请使用邮箱密码登录。</p>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="studio-label">EMAIL LOGIN</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            {notice && (
              <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {notice}
              </p>
            )}

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
                <div className="mb-1 flex items-center justify-between gap-3">
                  <label className="block">密码</label>
                  <span className="studio-data text-xs text-gray-500">MIN 6</span>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="输入密码"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                />
              </div>
              {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="studio-button studio-primary w-full px-4 py-2.5 text-white disabled:opacity-50"
              >
                {loading ? "登录中..." : "进入工作台"}
              </button>
            </form>
            <p className="mt-5 text-center text-sm text-gray-600">
              还没有账号？{" "}
              <Link href="/register" className="font-semibold text-rose-700 hover:underline">
                立即注册
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
