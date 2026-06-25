"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Project {
  id: string;
  title: string;
  storyBrief: string;
  durationSeconds: number;
  primaryScene: string;
  secondaryScene: string;
  aspectRatio: string;
  subtitleMode: string;
  dialogueMode?: string;
  voiceoverMode?: string;
  referenceImageCount?: number;
  referenceVideoCount?: number;
  referenceAudioCount?: number;
  referenceBgmCount?: number;
  stylePreset: string;
  finalPromptMarkdown: string;
  createdAt: string;
  updatedAt: string;
  _count: { referenceImages: number };
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/projects");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "项目列表加载失败，请刷新重试");
        return;
      }
      setProjects(data.projects || []);
    } catch {
      setError("项目列表加载失败，请确认本地服务正在运行");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProjects();
  }, [fetchProjects]);

  async function createProject() {
    if (!newTitle.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push(`/projects/${data.project.id}`);
        return;
      }
      setError(data.error || "项目创建失败，请刷新后重试");
    } catch {
      setError("项目创建失败，请确认本地服务正在运行");
    } finally {
      setCreating(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const generatedCount = projects.filter((project) => project.finalPromptMarkdown).length;
  const referenceImageTotal = projects.reduce((total, project) => total + project._count.referenceImages, 0);
  const lastUpdated = projects[0]?.updatedAt
    ? new Date(projects[0].updatedAt).toLocaleDateString("zh-CN")
    : "--";

  if (loading) {
    return (
      <div className="studio-shell flex min-h-screen items-center justify-center">
        <div className="studio-card studio-loading px-5 py-3 text-sm font-semibold text-gray-700">
          正在载入项目库
        </div>
      </div>
    );
  }

  return (
    <div className="studio-shell studio-workbench">
      <header className="studio-header">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <p className="studio-label">Video Prompt Studio</p>
            <h1 className="truncate text-xl font-bold">项目库</h1>
            <p className="mt-1 hidden text-xs text-gray-500 sm:block">AI 视频分镜控制台 · 项目资产中心</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="studio-chip hidden sm:inline-flex">LOCAL ONLINE</span>
            <span className="studio-chip hidden md:inline-flex">USER READY</span>
            <button onClick={logout} className="studio-button studio-secondary px-3 py-1.5 text-sm">
              退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-8">
        {error && (
          <div className="studio-panel-in mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="studio-card studio-panel-in mb-6 p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid gap-4 sm:grid-cols-4 lg:flex-1">
              <div className="studio-kpi">
                <p className="studio-label">PROJECT TOTAL</p>
                <p className="studio-data mt-2 text-2xl font-bold">{projects.length}</p>
              </div>
              <div className="studio-stat">
                <p className="studio-label">PROMPTS</p>
                <p className="studio-data mt-2 text-2xl font-bold">{generatedCount}</p>
              </div>
              <div className="studio-stat">
                <p className="studio-label">REF IMAGES</p>
                <p className="studio-data mt-2 text-2xl font-bold">{referenceImageTotal}</p>
              </div>
              <div className="studio-stat">
                <p className="studio-label">LAST UPDATED</p>
                <p className="studio-data mt-2 text-lg font-bold">{lastUpdated}</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="studio-button studio-primary w-full px-4 py-2 text-sm lg:w-auto"
            >
              新建项目
            </button>
          </div>
        </section>

        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="studio-label">PROJECT GRID</p>
            <h2 className="mt-1 text-lg font-semibold">最近项目</h2>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="studio-button studio-secondary px-3 py-1.5 text-sm"
          >
            创建
          </button>
        </div>

        {showCreate && (
          <div className="studio-card studio-panel-in mb-6 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="studio-label">CREATE PROJECT</p>
              <span className="studio-data text-xs text-gray-500">INLINE PANEL</span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="项目名称"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                autoFocus
              />
              <button
                onClick={createProject}
                disabled={creating || !newTitle.trim()}
                className="studio-button studio-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {creating ? "创建中..." : "创建"}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewTitle(""); }}
                className="studio-button studio-secondary px-4 py-2 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="studio-card studio-empty studio-panel-in p-12 text-center">
            <p className="text-sm font-semibold text-gray-700">还没有项目</p>
            <p className="mt-2 text-sm text-gray-500">创建第一个项目后，就可以进入视频 Prompt 生成流程。</p>
          </div>
        ) : (
          <div className="studio-motion-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, index) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="studio-project-link studio-card block p-5"
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="studio-label mb-1">PROJECT</p>
                    <h3 className="truncate font-semibold">{project.title}</h3>
                  </div>
                  <span className={project.finalPromptMarkdown ? "studio-chip" : "studio-chip studio-chip-warm"}>
                    {project.finalPromptMarkdown ? "已生成" : "草稿"}
                  </span>
                </div>
                {project.storyBrief && (
                  <p className="mb-4 line-clamp-2 text-sm leading-6 text-gray-600">{project.storyBrief}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                  {project.durationSeconds > 0 && (
                    <span className="rounded border border-gray-200 bg-white px-2 py-1">时长 {project.durationSeconds}s</span>
                  )}
                  <span className="rounded border border-gray-200 bg-white px-2 py-1">{project.primaryScene || "未选场景"}</span>
                  <span className="rounded border border-gray-200 bg-white px-2 py-1">{project.secondaryScene || "未选二级"}</span>
                  <span className="rounded border border-gray-200 bg-white px-2 py-1">{project.aspectRatio}</span>
                  <span className="rounded border border-gray-200 bg-white px-2 py-1">{project._count.referenceImages} 张参考图</span>
                </div>
                <p className="studio-data mt-4 text-xs text-gray-400">
                  {new Date(project.updatedAt).toLocaleDateString("zh-CN")}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
