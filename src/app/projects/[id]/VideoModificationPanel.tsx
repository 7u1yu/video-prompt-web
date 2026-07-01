"use client";

import { useEffect, useRef, useState } from "react";

interface ChangeSummaryItem {
  type: "character" | "prop" | "scene" | "voice" | "bgm";
  original: string;
  replacement: string;
  shots: string[];
  referenceLabel: string;
}

interface ImagePromptItem {
  index: number;
  kind: "character" | "scene" | "prop";
  title: string;
  prompt: string;
}

interface AudioReferenceItem {
  index: number;
  kind: "voice" | "bgm";
  title: string;
  sourceWork: string;
  sourceCharacterOrTrack: string;
  usage: string;
}

interface Workspace {
  sourceStoryboard: string;
  changeSummary: ChangeSummaryItem[];
  finalModificationPromptMarkdown: string;
  referenceImagePrompts: ImagePromptItem[];
  audioReferences: AudioReferenceItem[];
  updatedAt: string | null;
}

interface Props {
  projectId: string;
  apiPayload: {
    apiSettings: {
      textProvider: string;
      textApiKey: string;
      textBaseUrl: string;
      textModel: string;
    };
  };
  onError: (message: string) => void;
}

const EMPTY_WORKSPACE: Workspace = {
  sourceStoryboard: "",
  changeSummary: [],
  finalModificationPromptMarkdown: "",
  referenceImagePrompts: [],
  audioReferences: [],
  updatedAt: null,
};

const CHANGE_LABELS: Record<ChangeSummaryItem["type"], string> = {
  character: "人物",
  prop: "道具",
  scene: "场景",
  voice: "音色",
  bgm: "BGM",
};

const IMAGE_KIND_LABELS: Record<ImagePromptItem["kind"], string> = {
  character: "人物",
  prop: "道具",
  scene: "场景",
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  }
}

export default function VideoModificationPanel({
  projectId,
  apiPayload,
  onError,
}: Props) {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE);
  const [sourceStoryboard, setSourceStoryboard] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedSection, setCopiedSection] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${projectId}/video-modification`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "视频修改工作区加载失败");
        }
        if (!active) return;
        const next = { ...EMPTY_WORKSPACE, ...(data.workspace || {}) };
        setWorkspace(next);
        setSourceStoryboard(next.sourceStoryboard);
      })
      .catch((error) => {
        if (active) {
          onError(
            error instanceof Error
              ? error.message
              : "视频修改工作区加载失败，请确认本地服务正在运行"
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onError, projectId]);

  async function saveSource() {
    if (sourceStoryboard.length > 50_000) {
      onError("分镜稿不能超过 50000 个字符");
      return false;
    }
    setSaving(true);
    onError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/video-modification`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceStoryboard }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        onError(data.error || "分镜稿保存失败");
        return false;
      }
      setWorkspace((current) => ({
        ...current,
        sourceStoryboard,
        updatedAt: data.workspace?.updatedAt || current.updatedAt,
      }));
      return true;
    } catch {
      onError("分镜稿保存失败，请确认本地服务正在运行");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function generateModification() {
    const source = sourceStoryboard.trim();
    if (!source) {
      onError("请先粘贴或上传分镜剧情稿");
      return;
    }
    if (
      workspace.finalModificationPromptMarkdown &&
      !window.confirm("重新生成会覆盖当前视频修改方案，是否继续？")
    ) {
      return;
    }

    setGenerating(true);
    onError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/video-modification/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...apiPayload,
            sourceStoryboard: source,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        onError(data.error || "视频修改方案生成失败");
        return;
      }
      const next = { ...EMPTY_WORKSPACE, ...(data.workspace || {}) };
      setWorkspace(next);
      setSourceStoryboard(next.sourceStoryboard);
    } catch {
      onError("视频修改方案生成失败，请确认本地服务正在运行");
    } finally {
      setGenerating(false);
    }
  }

  async function clearWorkspace() {
    if (
      !window.confirm("确定清空当前分镜稿和视频修改方案吗？此操作不可撤销。")
    ) {
      return;
    }
    onError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/video-modification`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clear: true }),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        onError(data.error || "清空工作区失败");
        return;
      }
      setWorkspace(EMPTY_WORKSPACE);
      setSourceStoryboard("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      onError("清空工作区失败，请确认本地服务正在运行");
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "txt" && extension !== "md") {
      onError("只支持上传 .txt 或 .md 文件");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 200_000) {
      onError("文件过大，请上传不超过 200KB 的文本文件");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const text = await file.text();
    if (!text.trim()) {
      onError("上传的文件没有可用文本");
      return;
    }
    if (text.length > 50_000) {
      onError("分镜稿不能超过 50000 个字符");
      return;
    }
    setSourceStoryboard(text);
    onError("");
  }

  async function copySection(key: string, text: string) {
    const copied = await copyText(text);
    if (!copied) {
      onError("复制失败，请手动选中文本复制");
      return;
    }
    setCopiedSection(key);
    window.setTimeout(() => setCopiedSection(""), 1600);
  }

  if (loading) {
    return (
      <div className="studio-card studio-loading p-6 text-sm text-gray-600">
        正在载入视频修改工作区
      </div>
    );
  }

  const hasResult = Boolean(workspace.finalModificationPromptMarkdown);

  return (
    <div className="space-y-6">
      <section className="studio-card studio-panel-in p-6">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="studio-label">SOURCE STORYBOARD</p>
            <h2 className="text-lg font-semibold">原视频分镜剧情稿</h2>
            <p className="mt-1 text-sm text-gray-500">
              每个镜头请保留时间段，推荐使用 00:00–00:03 格式。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={(event) => void handleFile(event.target.files?.[0])}
              className="max-w-56 text-xs text-gray-600 file:mr-2 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-2 file:font-semibold"
            />
            <button
              type="button"
              onClick={() => void saveSource()}
              disabled={saving}
              className="studio-button studio-secondary px-3 py-2 text-xs disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存草稿"}
            </button>
            <button
              type="button"
              onClick={() => void clearWorkspace()}
              className="studio-button studio-secondary px-3 py-2 text-xs"
            >
              清空
            </button>
          </div>
        </div>

        <textarea
          value={sourceStoryboard}
          onChange={(event) => setSourceStoryboard(event.target.value)}
          rows={16}
          maxLength={50_000}
          placeholder={`00:00–00:03\n低机位仰拍，女骑士站在巨兽尸体上，披风随风摆动。\n\n00:03–00:06\n超广角航拍，怪物军团从草原远端冲锋。`}
          className="studio-pre min-h-80 w-full resize-y rounded-md border border-gray-300 p-4 text-sm leading-7 focus:outline-none"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">
            {sourceStoryboard.length.toLocaleString()} / 50,000 字符 · 文件仅在浏览器读取，不上传原文件
          </p>
          <button
            type="button"
            onClick={() => void generateModification()}
            disabled={generating || !sourceStoryboard.trim()}
            className={`studio-button studio-primary px-5 py-2.5 text-sm disabled:opacity-50 ${
              generating ? "studio-loading" : ""
            }`}
          >
            {generating
              ? "AI 正在分析并生成..."
              : hasResult
                ? "重新生成修改方案"
                : "分析并生成修改方案"}
          </button>
        </div>
      </section>

      {hasResult ? (
        <>
          <section className="studio-card studio-panel-in p-6">
            <div className="mb-4">
              <p className="studio-label">CHANGE SUMMARY</p>
              <h2 className="text-lg font-semibold">AI 精选改动</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {workspace.changeSummary.map((item, index) => (
                <article
                  key={`${item.referenceLabel}-${index}`}
                  className="rounded-md border border-gray-200 bg-white p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="studio-chip">{CHANGE_LABELS[item.type]}</span>
                    <span className="text-xs font-semibold text-gray-500">
                      {item.referenceLabel}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{item.original}</p>
                  <p className="my-1 text-sm font-semibold text-gray-400">↓</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {item.replacement}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-gray-500">
                    {item.shots.join("、")}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="studio-card studio-panel-in p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="studio-label">VIDEO EDIT PROMPT</p>
                <h2 className="text-lg font-semibold">视频修改 Prompt</h2>
              </div>
              <button
                type="button"
                onClick={() =>
                  void copySection(
                    "video",
                    workspace.finalModificationPromptMarkdown
                  )
                }
                className="studio-button studio-secondary px-3 py-1.5 text-xs"
              >
                {copiedSection === "video" ? "已复制" : "复制完整 Prompt"}
              </button>
            </div>
            <pre className="studio-pre max-h-[42rem] overflow-auto whitespace-pre-wrap rounded-md p-4 text-sm leading-7">
              {workspace.finalModificationPromptMarkdown}
            </pre>
          </section>

          {workspace.referenceImagePrompts.length > 0 ? (
            <section className="studio-card studio-panel-in p-6">
              <div className="mb-4">
                <p className="studio-label">IMAGE PROMPTS</p>
                <h2 className="text-lg font-semibold">替换素材生图 Prompt</h2>
              </div>
              <div className="space-y-4">
                {workspace.referenceImagePrompts.map((item) => (
                  <article
                    key={`image-${item.index}`}
                    className="rounded-md border border-gray-200 bg-white p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="studio-chip">
                          {IMAGE_KIND_LABELS[item.kind]}
                        </span>
                        <h3 className="text-sm font-semibold">
                          参考图{item.index} · {item.title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void copySection(`image-${item.index}`, item.prompt)
                        }
                        className="studio-button studio-secondary px-3 py-1.5 text-xs"
                      >
                        {copiedSection === `image-${item.index}`
                          ? "已复制"
                          : "复制"}
                      </button>
                    </div>
                    <p className="text-sm leading-7 text-gray-700">
                      {item.prompt}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {workspace.audioReferences.length > 0 ? (
            <section className="studio-card studio-panel-in p-6">
              <div className="mb-4">
                <p className="studio-label">AUDIO REFERENCES</p>
                <h2 className="text-lg font-semibold">BGM / 人物音色参考</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {workspace.audioReferences.map((item) => (
                  <article
                    key={`audio-${item.index}`}
                    className="rounded-md border border-gray-200 bg-white p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="studio-chip">
                        {item.kind === "bgm" ? "BGM" : "音色"}
                      </span>
                      <span className="text-xs font-semibold text-gray-500">
                        参考音频{item.index}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm text-gray-700">
                      {item.sourceWork} · {item.sourceCharacterOrTrack}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                      {item.usage}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <div className="studio-card-quiet p-8 text-center text-sm text-gray-500">
          提交分镜稿后，系统会输出改动摘要、视频修改 Prompt、独立生图 Prompt 和音频参考。
        </div>
      )}
    </div>
  );
}
