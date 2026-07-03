"use client";

import Image from "next/image";
import { useCallback, useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import VideoModificationPanel from "./VideoModificationPanel";

interface ReferenceImage {
  id: string;
  index: number;
  kind: string;
  title: string;
  prompt: string;
  imagePath: string | null;
  generationStatus: string;
  quality: string;
  size: string;
}

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
  cameraMotionStyle?: string;
  finalPromptMarkdown: string;
  referenceAudioMarkdown: string;
  createdAt: string;
  updatedAt: string;
  referenceImages: ReferenceImage[];
}

interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  mode: "openai" | "compatible" | "siliconflow" | "openrouter" | "pollinations";
}

interface ApiSettings {
  textProvider: string;
  textApiKey: string;
  textBaseUrl: string;
  textModel: string;
  imageProvider: string;
  imageApiKey: string;
  imageBaseUrl: string;
  imageModel: string;
}

interface PromptChatMessage {
  role: "user" | "assistant";
  content: string;
}

const PRIMARY_SCENE_OPTIONS = ["漫剧", "真人剧", "电影"];

const SECONDARY_SCENE_OPTIONS = [
  "恋爱校园", "奇幻冒险", "悬疑推理", "古风武侠", "历史武侠",
  "爽文剧", "都市情感", "科幻", "剧情", "动作", "其他",
];

const CAMERA_MOTION_OPTIONS = [
  { id: "low-push-reveal", label: "低机位前推 + 抬镜揭示" },
  {
    id: "flight-rush-to-closeup",
    label: "飞行推进 + 由远景快速推至人物特写",
  },
  { id: "lateral-foreground-wipe", label: "横向跟拍 + 前景遮挡转场" },
  { id: "half-orbit-pressure", label: "环绕半圈 + 情绪压迫推进" },
  { id: "telephoto-compression-follow", label: "长焦压缩跟拍 + 背景逼近感" },
  { id: "top-down-descend-rotate", label: "俯拍下降 + 旋转落位" },
  { id: "handheld-refocus", label: "手持贴近 + 失焦再对焦" },
  { id: "dolly-zoom-unease", label: "推拉变焦 + 空间异样感" },
  { id: "reflection-to-reality", label: "从反射入画 + 实景接管" },
  { id: "match-action-transition", label: "动作匹配剪辑 + 方向连续转场" },
  { id: "static-frame-micro-motion", label: "静止构图 + 局部运动打破" },
];

const STYLE_OPTIONS_BY_PRIMARY_SCENE: Record<string, string[]> = {
  漫剧: [
    "日系精致漫剧质感",
    "国漫电影级厚涂",
    "韩漫条漫高对比",
    "水墨国风动画",
  ],
  真人剧: [
    "现代写实真人剧质感",
    "爽文短剧写实风格",
    "都市情感真人剧质感",
    "古装武侠写实质感",
  ],
  电影: [
    "商业电影级写实质感",
    "电影级写实悬疑质感",
    "冷灰蓝胶片质感",
    "商业大片海报质感",
  ],
};

const STYLE_OPTIONS_BY_SCENE_PAIR: Record<string, string[]> = {
  "漫剧::恋爱校园": ["新海诚风", "京都动画风", "清透校园日漫", "柔光青春条漫"],
  "漫剧::奇幻冒险": ["宫崎骏风", "国漫电影级奇幻", "厚涂幻想冒险", "明亮童话动画"],
  "漫剧::悬疑推理": ["今敏风", "韩漫条漫悬疑风", "90年代赛璐珞校园怪谈", "暗色心理惊悚动画"],
  "漫剧::古风武侠": ["水墨动画", "国漫古风厚涂", "工笔国风漫剧", "江湖群像条漫"],
  "漫剧::历史武侠": ["水墨国风动画", "古卷质感国漫", "写意武侠动画", "厚涂历史群像"],
  "漫剧::爽文剧": ["高燃国漫爽文", "韩漫逆袭短剧风", "强对比热血条漫", "都市异能漫剧"],
  "漫剧::都市情感": ["新海诚风", "今敏都市霓虹", "韩漫都市情感风", "柔焦夜景条漫"],
  "漫剧::科幻": ["赛博朋克霓虹漫剧", "硬表面科幻国漫", "未来都市条漫", "冷色机械动画"],
  "漫剧::剧情": ["写实日漫电影感", "淡彩生活流动画", "胶片感赛璐珞", "细腻心理漫剧"],
  "漫剧::动作": ["MAPPA/现代少年漫风", "高燃战斗国漫", "速度线动作条漫", "暗色硬派动画"],
  "漫剧::其他": ["日系精致漫剧质感", "国漫电影级厚涂", "韩漫条漫高对比", "水墨国风动画"],

  "真人剧::恋爱校园": ["清新校园真人剧质感", "日光青春写实风", "柔焦校园偶像剧", "自然光青春短剧"],
  "真人剧::奇幻冒险": ["现实奇幻真人剧质感", "东方奇幻短剧写实", "轻魔幻冒险写实风", "高饱和奇幻剧集"],
  "真人剧::悬疑推理": ["电影级写实悬疑质感", "冷色刑侦剧质感", "暗调心理悬疑", "雨夜都市悬疑"],
  "真人剧::古风武侠": ["古装武侠写实质感", "新派江湖短剧风", "国风剧集电影感", "冷兵器动作写实"],
  "真人剧::历史武侠": ["历史剧厚重写实", "古装群像剧质感", "低饱和江湖史诗", "旧卷轴色调武侠"],
  "真人剧::爽文剧": ["爽文短剧写实风格", "强反差逆袭短剧", "都市战神短剧质感", "高节奏商业短剧"],
  "真人剧::都市情感": ["都市情感真人剧质感", "自然光生活流剧集", "夜景都市情绪片", "轻熟情感短剧"],
  "真人剧::科幻": ["赛博朋克真人剧霓虹质感", "近未来写实剧集", "冷色硬科幻真人剧", "都市科技悬疑"],
  "真人剧::剧情": ["现代写实真人剧质感", "生活流现实主义", "低饱和纪实剧集", "细腻人物群像"],
  "真人剧::动作": ["硬派动作真人剧", "警匪追逐写实质感", "冷峻格斗短剧", "高速商业动作剧"],
  "真人剧::其他": ["现代写实真人剧质感", "爽文短剧写实风格", "都市情感真人剧质感", "古装武侠写实质感"],

  "电影::恋爱校园": ["青春爱情电影质感", "清透日光胶片", "夏日校园电影感", "柔焦青春长片"],
  "电影::奇幻冒险": ["奇幻冒险商业大片", "史诗幻想电影质感", "高饱和魔法电影", "宏大世界观电影感"],
  "电影::悬疑推理": ["电影级写实悬疑质感", "黑色电影冷峻光影", "雨夜犯罪电影感", "心理惊悚胶片"],
  "电影::古风武侠": ["古风武侠电影质感", "新武侠冷兵器电影", "水墨江湖电影感", "东方史诗动作片"],
  "电影::历史武侠": ["历史史诗电影质感", "低饱和古代战争片", "厚重古装武侠电影", "东方群像史诗"],
  "电影::爽文剧": ["商业大片爽感质感", "逆袭剧情电影感", "高对比都市商业片", "强节奏类型片"],
  "电影::都市情感": ["都市情感电影质感", "冷暖交错胶片感", "现代爱情电影光影", "夜景情绪电影"],
  "电影::科幻": ["赛博朋克电影霓虹质感", "硬科幻电影质感", "近未来冷色商业片", "太空/机械史诗感"],
  "电影::剧情": ["冷灰蓝胶片质感", "现实主义剧情片", "人物群像电影感", "自然光文艺片"],
  "电影::动作": ["商业动作大片质感", "硬派犯罪动作片", "高速追逐电影感", "冷峻格斗电影"],
  "电影::其他": ["商业电影级写实质感", "电影级写实悬疑质感", "冷灰蓝胶片质感", "商业大片海报质感"],
};

function getStyleOptions(primaryScene: string, secondaryScene: string) {
  if (!primaryScene || !secondaryScene) return [];
  return (
    STYLE_OPTIONS_BY_SCENE_PAIR[`${primaryScene}::${secondaryScene}`] ||
    STYLE_OPTIONS_BY_PRIMARY_SCENE[primaryScene] ||
    []
  );
}

function isValidStylePreset(primaryScene: string, secondaryScene: string, stylePreset: string) {
  return getStyleOptions(primaryScene, secondaryScene).includes(stylePreset);
}

const API_SETTINGS_STORAGE_KEY = "video-prompt-api-settings";

const TEXT_PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "openai", label: "OpenAI", baseUrl: "", model: "gpt-5.5", mode: "openai" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", mode: "compatible" },
  { id: "qwen", label: "通义千问 DashScope", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", mode: "compatible" },
  { id: "moonshot", label: "Moonshot Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k", mode: "compatible" },
  { id: "zhipu", label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.5", mode: "compatible" },
  { id: "doubao", label: "火山方舟 Doubao", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seed-1-6-251015", mode: "compatible" },
  { id: "baidu-qianfan", label: "百度千帆 ERNIE", baseUrl: "https://qianfan.baidubce.com/v2", model: "ernie-4.0-turbo-128k", mode: "compatible" },
  { id: "hunyuan", label: "腾讯混元", baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", model: "hunyuan-turbos-latest", mode: "compatible" },
  { id: "minimax", label: "MiniMax", baseUrl: "https://api.minimax.io/v1", model: "MiniMax-M2.5", mode: "compatible" },
  { id: "minimax-cn", label: "MiniMax 国内", baseUrl: "https://api.minimaxi.com/v1", model: "MiniMax-M2.5", mode: "compatible" },
  { id: "stepfun", label: "阶跃星辰 StepFun", baseUrl: "https://api.stepfun.com/v1", model: "step-3.5-flash", mode: "compatible" },
  { id: "stepfun-plan", label: "阶跃 Step Plan", baseUrl: "https://api.stepfun.com/step_plan/v1", model: "step-3.5-flash-2603", mode: "compatible" },
  { id: "sensenova", label: "商汤日日新 SenseNova", baseUrl: "https://api.sensenova.cn/compatible-mode/v2", model: "SenseChat-5", mode: "compatible" },
  { id: "01ai", label: "零一万物 01.AI", baseUrl: "https://api.01.ai/v1", model: "yi-large", mode: "compatible" },
  { id: "baichuan", label: "百川智能", baseUrl: "https://api.baichuan-ai.com/v1", model: "Baichuan4-Turbo", mode: "compatible" },
  { id: "modelscope", label: "魔搭 ModelScope", baseUrl: "https://api-inference.modelscope.cn/v1", model: "Qwen/Qwen3-Max", mode: "compatible" },
  { id: "siliconflow-text", label: "SiliconFlow 文本", baseUrl: "https://api.siliconflow.com/v1", model: "deepseek-ai/DeepSeek-V3.2", mode: "compatible" },
  { id: "custom", label: "自定义 OpenAI-compatible", baseUrl: "", model: "", mode: "compatible" },
];

const IMAGE_PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "pollinations-free", label: "免费 Pollinations Flux", baseUrl: "https://image.pollinations.ai", model: "flux", mode: "pollinations" },
  { id: "openai", label: "OpenAI Images", baseUrl: "", model: "gpt-image-2", mode: "openai" },
  { id: "siliconflow", label: "SiliconFlow 图像", baseUrl: "https://api.siliconflow.com/v1", model: "black-forest-labs/FLUX.2-pro", mode: "siliconflow" },
  { id: "siliconflow-qwen-image", label: "SiliconFlow Qwen Image", baseUrl: "https://api.siliconflow.com/v1", model: "Qwen/Qwen-Image", mode: "siliconflow" },
  { id: "qwen-image", label: "阿里百炼 Qwen Image", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-image", mode: "compatible" },
  { id: "openrouter", label: "OpenRouter 图像模型", baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-2.5-flash-image-preview", mode: "openrouter" },
  { id: "doubao-seedream", label: "火山方舟 Seedream", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seedream-4-5", mode: "compatible" },
  { id: "zhipu-cogview", label: "智谱 CogView", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "cogView-4-250304", mode: "compatible" },
  { id: "imagerouter-seedream", label: "ImageRouter Seedream", baseUrl: "https://api.imagerouter.io/v1", model: "bytedance/seedream-4.5", mode: "compatible" },
  { id: "torouter", label: "ToRouter 图像网关", baseUrl: "https://api.torouter.ai/v1", model: "openai/gpt-image-1", mode: "compatible" },
  { id: "runcrate", label: "Runcrate 图像 API", baseUrl: "https://api.runcrate.ai/v1", model: "black-forest-labs/flux.1-schnell", mode: "compatible" },
  { id: "nvidia-nim", label: "NVIDIA NIM /images", baseUrl: "", model: "black-forest-labs/flux.1-dev", mode: "compatible" },
  { id: "litellm", label: "LiteLLM 图片代理", baseUrl: "http://localhost:4000/v1", model: "gpt-image-1", mode: "compatible" },
  { id: "self-hosted", label: "自托管 OpenAI 图片接口", baseUrl: "http://localhost:8000/v1", model: "stabilityai/stable-diffusion-xl-base-1.0", mode: "compatible" },
  { id: "custom", label: "自定义 OpenAI-compatible 图片接口", baseUrl: "", model: "", mode: "compatible" },
];

const DEFAULT_API_SETTINGS: ApiSettings = {
  textProvider: "openai",
  textApiKey: "",
  textBaseUrl: "",
  textModel: "gpt-5.5",
  imageProvider: "pollinations-free",
  imageApiKey: "",
  imageBaseUrl: "https://image.pollinations.ai",
  imageModel: "flux",
};

function loadApiSettings() {
  if (typeof window === "undefined") return DEFAULT_API_SETTINGS;
  try {
    const stored = window.localStorage.getItem(API_SETTINGS_STORAGE_KEY);
    const settings = stored ? { ...DEFAULT_API_SETTINGS, ...JSON.parse(stored) } : DEFAULT_API_SETTINGS;
    if (!settings.imageApiKey && settings.imageProvider === "openai") {
      return {
        ...settings,
        imageProvider: DEFAULT_API_SETTINGS.imageProvider,
        imageBaseUrl: DEFAULT_API_SETTINGS.imageBaseUrl,
        imageModel: DEFAULT_API_SETTINGS.imageModel,
      };
    }
    return settings;
  } catch {
    return DEFAULT_API_SETTINGS;
  }
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [apiSettings, setApiSettings] = useState<ApiSettings>(DEFAULT_API_SETTINGS);
  const [apiSettingsSaved, setApiSettingsSaved] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [chatMessages, setChatMessages] = useState<PromptChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingRevisedPrompt, setPendingRevisedPrompt] = useState("");
  const [applyingChatPrompt, setApplyingChatPrompt] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"original" | "modify">(
    "original"
  );

  // Form state
  const [title, setTitle] = useState("");
  const [storyBrief, setStoryBrief] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [primaryScene, setPrimaryScene] = useState("");
  const [secondaryScene, setSecondaryScene] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [subtitleMode, setSubtitleMode] = useState("none");
  const [dialogueMode, setDialogueMode] = useState("auto");
  const [voiceoverMode, setVoiceoverMode] = useState("auto");
  const [referenceImageCount, setReferenceImageCount] = useState(6);
  const [referenceVideoCount, setReferenceVideoCount] = useState(0);
  const [referenceAudioCount, setReferenceAudioCount] = useState(0);
  const [referenceBgmCount, setReferenceBgmCount] = useState(0);
  const [stylePreset, setStylePreset] = useState("");
  const [cameraMotionStyle, setCameraMotionStyle] = useState("");

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 404) {
        router.push("/projects");
        return;
      }
      const data = await res.json();
      const p = data.project;
      setProject(p);
      setTitle(p.title);
      setStoryBrief(p.storyBrief);
      setDurationSeconds(p.durationSeconds);
      const nextPrimaryScene = PRIMARY_SCENE_OPTIONS.includes(p.primaryScene) ? p.primaryScene : "漫剧";
      const nextSecondaryScene = p.secondaryScene || "";
      setPrimaryScene(nextPrimaryScene);
      setSecondaryScene(nextSecondaryScene);
      setAspectRatio(p.aspectRatio);
      setSubtitleMode(p.subtitleMode);
      setDialogueMode(p.dialogueMode || "auto");
      setVoiceoverMode(p.voiceoverMode || "auto");
      setReferenceImageCount(p.referenceImageCount ?? 6);
      setReferenceVideoCount(p.referenceVideoCount ?? 0);
      setReferenceAudioCount(p.referenceAudioCount ?? 0);
      setReferenceBgmCount(p.referenceBgmCount ?? 0);
      setCameraMotionStyle(p.cameraMotionStyle || "");
      setStylePreset(
        isValidStylePreset(nextPrimaryScene, nextSecondaryScene, p.stylePreset)
          ? p.stylePreset
          : ""
      );
    } catch {
      console.error("Failed to fetch project");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const styleOptions = getStyleOptions(primaryScene, secondaryScene);
  const selectedImagePreset = IMAGE_PROVIDER_PRESETS.find((provider) => provider.id === apiSettings.imageProvider);
  const selectedImageProviderMode = selectedImagePreset?.mode || "compatible";

  function updatePrimaryScene(nextPrimaryScene: string) {
    setPrimaryScene(nextPrimaryScene);
    if (!isValidStylePreset(nextPrimaryScene, secondaryScene, stylePreset)) {
      setStylePreset("");
    }
  }

  function updateSecondaryScene(nextSecondaryScene: string) {
    setSecondaryScene(nextSecondaryScene);
    if (!isValidStylePreset(primaryScene, nextSecondaryScene, stylePreset)) {
      setStylePreset("");
    }
  }

  function toggleCameraMotionStyle(optionId: string) {
    const current = cameraMotionStyle.split(",").filter(Boolean);
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    setCameraMotionStyle(next.join(","));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiSettings(loadApiSettings());
  }, []);

  function updateApiSettings(patch: Partial<ApiSettings>) {
    setApiSettings((current) => ({ ...current, ...patch }));
    setApiSettingsSaved(false);
  }

  function selectTextProvider(providerId: string) {
    const preset = TEXT_PROVIDER_PRESETS.find((provider) => provider.id === providerId);
    updateApiSettings({
      textProvider: providerId,
      textBaseUrl: preset?.baseUrl || "",
      textModel: preset?.model || "",
    });
  }

  function selectImageProvider(providerId: string) {
    const preset = IMAGE_PROVIDER_PRESETS.find((provider) => provider.id === providerId);
    updateApiSettings({
      imageProvider: providerId,
      imageBaseUrl: preset?.baseUrl || "",
      imageModel: preset?.model || "",
    });
  }

  function saveApiSettings() {
    window.localStorage.setItem(API_SETTINGS_STORAGE_KEY, JSON.stringify(apiSettings));
    setApiSettingsSaved(true);
    setShowApiSettings(false);
    setTimeout(() => setApiSettingsSaved(false), 2000);
  }

  function buildApiPayload() {
    const textPreset = TEXT_PROVIDER_PRESETS.find((provider) => provider.id === apiSettings.textProvider);
    const imagePreset = IMAGE_PROVIDER_PRESETS.find((provider) => provider.id === apiSettings.imageProvider);
    return {
      apiSettings: {
        textProvider: textPreset?.mode || "compatible",
        textApiKey: apiSettings.textApiKey,
        textBaseUrl: apiSettings.textBaseUrl,
        textModel: apiSettings.textModel,
        imageProvider: imagePreset?.mode || "compatible",
        imageApiKey: apiSettings.imageApiKey || apiSettings.textApiKey,
        imageBaseUrl: apiSettings.imageBaseUrl,
        imageModel: apiSettings.imageModel,
      },
    };
  }

  async function saveProject() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          storyBrief,
          durationSeconds,
          primaryScene,
          secondaryScene,
          aspectRatio,
          subtitleMode,
          dialogueMode,
          voiceoverMode,
          referenceImageCount,
          referenceVideoCount,
          referenceAudioCount,
          referenceBgmCount,
          stylePreset,
          cameraMotionStyle,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Save failed");
      }
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function generatePrompt() {
    if (!durationSeconds || durationSeconds <= 0) {
      setError("请先设置视频时长");
      return;
    }
    if (!primaryScene) {
      setError("请先选择一级场景");
      return;
    }
    if (!secondaryScene) {
      setError("请先选择二级场景");
      return;
    }

    // Save first
    await saveProject();

    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${id}/generate-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildApiPayload()),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
        return;
      }
      setProject(data.project);
      setStoryBrief(data.project.storyBrief || "");
      setChatMessages([]);
      setPendingRevisedPrompt("");
    } catch {
      setError("Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function generateImage(refId: string) {
    if (!project) return;

    setProject((current) =>
      current
        ? {
            ...current,
            referenceImages: current.referenceImages.map((img) =>
              img.id === refId ? { ...img, generationStatus: "loading" } : img
            ),
          }
        : current
    );

    try {
      const res = await fetch(`/api/reference-images/${refId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildApiPayload()),
      });
      const data = await res.json();
      if (res.ok && data.referenceImage) {
        setProject((current) =>
          current
            ? {
                ...current,
                referenceImages: current.referenceImages.map((img) =>
                  img.id === refId ? { ...data.referenceImage } : img
                ),
              }
            : current
        );
      } else {
        setProject((current) =>
          current
            ? {
                ...current,
                referenceImages: current.referenceImages.map((img) =>
                  img.id === refId ? { ...img, generationStatus: "failed" } : img
                ),
              }
            : current
        );
      }
    } catch {
      setProject((current) =>
        current
          ? {
              ...current,
              referenceImages: current.referenceImages.map((img) =>
                img.id === refId ? { ...img, generationStatus: "failed" } : img
              ),
            }
          : current
      );
    }
  }

  async function copyText(text: string) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall back to a textarea copy for browsers that block Clipboard API.
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async function copyPrompt() {
    if (!project?.finalPromptMarkdown) return;
    const ok = await copyText(project.finalPromptMarkdown);
    if (!ok) {
      setError("复制失败，请手动选中文本复制");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function sendPromptChat() {
    if (!project?.finalPromptMarkdown) {
      setError("请先生成完整 Prompt，再使用 AI 改稿对话");
      return;
    }

    const message = chatInput.trim();
    if (!message || chatLoading) return;

    const nextMessages: PromptChatMessage[] = [...chatMessages, { role: "user", content: message }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/projects/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildApiPayload(),
          message,
          history: chatMessages,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChatMessages(chatMessages);
        setError(data.error || "AI 改稿失败，请稍后重试");
        return;
      }

      setChatMessages((current) => [...current, { role: "assistant", content: data.reply || "已完成修改。" }]);
      setPendingRevisedPrompt(data.revisedPromptMarkdown || "");
    } catch {
      setChatMessages(chatMessages);
      setError("AI 改稿失败，请确认本地服务正在运行");
    } finally {
      setChatLoading(false);
    }
  }

  async function applyRevisedPrompt() {
    if (!pendingRevisedPrompt.trim()) return;
    setApplyingChatPrompt(true);
    setError("");

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalPromptMarkdown: pendingRevisedPrompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "应用修改失败");
        return;
      }
      setProject((current) =>
        current ? { ...current, finalPromptMarkdown: data.project?.finalPromptMarkdown || pendingRevisedPrompt } : current
      );
      setPendingRevisedPrompt("");
      setChatMessages((current) => [...current, { role: "assistant", content: "修改稿已应用到生成结果。" }]);
    } catch {
      setError("应用修改失败，请确认本地服务正在运行");
    } finally {
      setApplyingChatPrompt(false);
    }
  }

  if (loading) {
    return (
      <div className="studio-shell flex min-h-screen items-center justify-center">
        <div className="studio-card studio-loading px-5 py-3 text-sm font-semibold text-gray-700">
          正在载入项目工作台
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="studio-shell flex min-h-screen items-center justify-center">
        <div className="studio-card px-5 py-3 text-sm font-semibold text-gray-700">项目不存在</div>
      </div>
    );
  }

  const kindLabel: Record<string, string> = {
    character: "角色",
    scene: "场景",
    prop: "道具",
    atmosphere: "氛围",
  };
  const setupReady = Boolean(durationSeconds && primaryScene && secondaryScene);
  const promptReady = Boolean(project.finalPromptMarkdown);
  const generatedImagesCount = project.referenceImages.filter((img) => img.generationStatus === "succeeded").length;
  const textProviderLabel = TEXT_PROVIDER_PRESETS.find((provider) => provider.id === apiSettings.textProvider)?.label || "自定义";
  const imageProviderLabel = IMAGE_PROVIDER_PRESETS.find((provider) => provider.id === apiSettings.imageProvider)?.label || "自定义";
  const selectedCameraMotionStyles = cameraMotionStyle.split(",").filter(Boolean);

  return (
    <div className="studio-shell studio-workbench">
      <header className="studio-header">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-4">
          <Link href="/projects" className="studio-button studio-secondary px-3 py-1.5 text-sm">
            &larr; 返回项目库
          </Link>
          <div className="min-w-0 flex-1">
            <p className="studio-label">Video Prompt Studio</p>
            <h1 className="truncate text-lg font-bold">{project.title}</h1>
            <p className="mt-1 hidden text-xs text-gray-500 sm:block">AI 视频分镜控制台 · 本地高保真工作台</p>
          </div>
          <span className="studio-chip hidden md:inline-flex">LOCAL ONLINE</span>
          <span className="studio-chip hidden lg:inline-flex">{textProviderLabel}</span>
          <span className="studio-chip">{primaryScene || "未选场景"}</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-8">
        {error && (
          <div className="studio-panel-in mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div
          className="mb-6 inline-flex rounded-md border border-gray-200 bg-white p-1"
          role="tablist"
          aria-label="项目工作模式"
        >
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === "original"}
            onClick={() => setWorkspaceMode("original")}
            className={`min-h-10 rounded px-4 text-sm font-semibold transition ${
              workspaceMode === "original"
                ? "bg-[#1a1a1b] text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            原创视频 Prompt
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === "modify"}
            onClick={() => setWorkspaceMode("modify")}
            className={`min-h-10 rounded px-4 text-sm font-semibold transition ${
              workspaceMode === "modify"
                ? "bg-[#1a1a1b] text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            视频修改 Prompt
          </button>
        </div>

        {workspaceMode === "original" ? (
          <>
        <div className="studio-card studio-panel-in mb-6 p-4">
          <div className="studio-motion-grid grid gap-3 md:grid-cols-3">
            <div className={`studio-kpi rounded-md border p-3 ${setupReady ? "border-[#1a1a1b] bg-white" : "border-gray-200 bg-white/70"}`}>
              <div className="studio-label">01 配置</div>
              <div className="mt-1 text-sm font-bold">{setupReady ? "已就绪" : "待完善"}</div>
              <div className="studio-data mt-2 text-xs text-gray-500">{durationSeconds || 0}s · {primaryScene || "一级场景"} · {secondaryScene || "二级场景"}</div>
            </div>
            <div className={`studio-kpi rounded-md border p-3 ${promptReady ? "border-[#1a1a1b] bg-white" : "border-gray-200 bg-white/70"} ${generating ? "studio-loading" : ""}`}>
              <div className="studio-label">02 剧本</div>
              <div className="mt-1 text-sm font-bold">{generating ? "生成中" : promptReady ? "已生成" : "未生成"}</div>
              <div className="studio-data mt-2 text-xs text-gray-500">{textProviderLabel}</div>
            </div>
            <div className={`studio-kpi rounded-md border p-3 ${generatedImagesCount > 0 ? "border-[#1a1a1b] bg-white" : "border-gray-200 bg-white/70"}`}>
              <div className="studio-label">03 参考图</div>
              <div className="mt-1 text-sm font-bold">{generatedImagesCount}/{referenceImageCount} 已生成</div>
              <div className="studio-data mt-2 text-xs text-gray-500">运镜/转场 {referenceVideoCount} · 音色 {referenceAudioCount} · BGM {referenceBgmCount}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(380px,0.62fr)_minmax(0,1fr)]">
          {/* Left: Input Form */}
          <div className="space-y-6">
            <div className="studio-card studio-panel-in p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="studio-label">MODEL ROUTER</p>
                  <h2 className="text-lg font-semibold">API 设置</h2>
                  {!showApiSettings && (
                    <p className="mt-1 text-xs text-gray-500">
                      当前：{textProviderLabel} / {imageProviderLabel}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {showApiSettings && (
                    <button
                      onClick={saveApiSettings}
                      className="studio-button studio-secondary px-3 py-1 text-xs"
                    >
                      {apiSettingsSaved ? "已保存" : "保存并隐藏"}
                    </button>
                  )}
                  <button
                    onClick={() => setShowApiSettings((current) => !current)}
                    className="studio-button studio-secondary px-3 py-1 text-xs"
                  >
                    {showApiSettings ? "隐藏" : "显示设置"}
                  </button>
                </div>
              </div>

              {showApiSettings && (
              <div className="studio-card-quiet studio-panel-in space-y-4 p-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">文本模型供应商</label>
                  <select
                    value={apiSettings.textProvider}
                    onChange={(e) => selectTextProvider(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                  >
                    {TEXT_PROVIDER_PRESETS.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.label}</option>
                    ))}
                  </select>
                </div>

                {apiSettings.textProvider !== "openai" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">文本 Base URL</label>
                    <input
                      type="url"
                      value={apiSettings.textBaseUrl}
                      onChange={(e) => updateApiSettings({ textBaseUrl: e.target.value })}
                      placeholder="https://api.example.com/v1"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                    />
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">文本模型</label>
                    <input
                      type="text"
                      value={apiSettings.textModel}
                      onChange={(e) => updateApiSettings({ textModel: e.target.value })}
                      placeholder="gpt-5.5"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">文本 API Key</label>
                    <input
                      type="password"
                      value={apiSettings.textApiKey}
                      onChange={(e) => updateApiSettings({ textApiKey: e.target.value })}
                      placeholder="留空则使用服务端 .env"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">参考图生图接口</label>
                  <select
                    value={apiSettings.imageProvider}
                    onChange={(e) => selectImageProvider(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                  >
                    {IMAGE_PROVIDER_PRESETS.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.label}</option>
                    ))}
                  </select>
                </div>

                {selectedImageProviderMode === "pollinations" ? (
                  <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    当前使用免费临时生图通道，无需填写图片 API Key；若高峰期失败，可稍后重试或切换付费供应商。
                  </p>
                ) : null}

                {selectedImageProviderMode !== "openai" && selectedImageProviderMode !== "pollinations" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">图片 Base URL</label>
                    <input
                      type="url"
                      value={apiSettings.imageBaseUrl}
                      onChange={(e) => updateApiSettings({ imageBaseUrl: e.target.value })}
                      placeholder="https://api.example.com/v1"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                    />
                  </div>
                )}

                {selectedImageProviderMode === "pollinations" ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">图片模型</label>
                    <input
                      type="text"
                      value={apiSettings.imageModel}
                      onChange={(e) => updateApiSettings({ imageModel: e.target.value })}
                      placeholder="gpt-image-2"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">图片模型</label>
                      <input
                        type="text"
                        value={apiSettings.imageModel}
                        onChange={(e) => updateApiSettings({ imageModel: e.target.value })}
                        placeholder="gpt-image-2"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">图片 API Key</label>
                      <input
                        type="password"
                        value={apiSettings.imageApiKey}
                        onChange={(e) => updateApiSettings({ imageApiKey: e.target.value })}
                        placeholder="留空则复用文本 API Key"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>

            <div className="studio-card studio-stage studio-panel-in p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="studio-label">PROJECT CONFIG</p>
                  <h2 className="text-lg font-semibold">项目设置</h2>
                  <p className="mt-1 text-xs text-gray-500">场景、画风、声音与参考素材</p>
                </div>
                <span className={setupReady ? "studio-chip" : "studio-chip studio-chip-warm"}>
                  {setupReady ? "可生成" : "待配置"}
                </span>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">项目标题</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    视频时长（秒） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={durationSeconds || ""}
                    onChange={(e) => setDurationSeconds(Number(e.target.value))}
                    min={1}
                    placeholder="如：30"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">一级场景</label>
                  <select
                    value={primaryScene}
                    onChange={(e) => updatePrimaryScene(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                  >
                    <option value="">请选择</option>
                    {PRIMARY_SCENE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">二级场景</label>
                  <select
                    value={secondaryScene}
                    onChange={(e) => updateSecondaryScene(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                  >
                    <option value="">请选择</option>
                    {SECONDARY_SCENE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">画风偏好</label>
                  <select
                    value={stylePreset}
                    onChange={(e) => setStylePreset(e.target.value)}
                    disabled={!primaryScene || !secondaryScene}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="">
                      {primaryScene && secondaryScene
                        ? "不指定，由模型根据题材选择"
                        : "请先选择一级场景和二级场景"}
                    </option>
                    {styleOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-gray-700">参考视频运镜方式</label>
                    {selectedCameraMotionStyles.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCameraMotionStyle("")}
                        className="text-xs font-semibold text-gray-500 hover:text-gray-900"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CAMERA_MOTION_OPTIONS.map((option) => {
                      const selected = selectedCameraMotionStyles.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleCameraMotionStyle(option.id)}
                          className={`rounded-md border px-3 py-2 text-left text-xs font-semibold transition ${
                            selected
                              ? "border-[#1a1a1b] bg-[#1a1a1b] text-white"
                              : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    可多选。生成时会把这些运镜方式分配到不同镜头和参考视频 Prompt 里。
                  </p>
                </div>

                <div className="rounded-md border border-gray-200 bg-white p-3">
                  <div className="studio-label mb-1">STORY BRIEF</div>
                  <p className="text-sm text-gray-600">
                    {storyBrief || "生成 Prompt 时，模型会根据一级场景和二级场景随机创作故事梗概。"}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">画幅比例</label>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                    >
                      <option value="9:16">9:16（竖屏）</option>
                      <option value="16:9">16:9（横屏）</option>
                      <option value="1:1">1:1（方形）</option>
                      <option value="4:3">4:3</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">字幕模式</label>
                    <select
                      value={subtitleMode}
                      onChange={(e) => setSubtitleMode(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                    >
                      <option value="none">无字幕</option>
                      <option value="chinese">中文字幕</option>
                      <option value="english">英文字幕</option>
                      <option value="bilingual">双语字幕</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">台词对话</label>
                    <select
                      value={dialogueMode}
                      onChange={(e) => setDialogueMode(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                    >
                      <option value="auto">模型决定</option>
                      <option value="yes">有台词对话</option>
                      <option value="no">无台词对话</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">画外旁白</label>
                    <select
                      value={voiceoverMode}
                      onChange={(e) => setVoiceoverMode(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                    >
                      <option value="auto">模型决定</option>
                      <option value="yes">有画外旁白</option>
                      <option value="no">无画外旁白</option>
                    </select>
                  </div>
                </div>

                <div className="studio-card-quiet p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="studio-label mb-1">REFERENCE ASSETS</div>
                      <div className="text-sm font-semibold">参考素材数量</div>
                      <p className="mt-1 text-xs text-gray-500">参考图会生成图片 Prompt；参考视频仅用于运镜/转场；音色参考与 BGM 分开生成出处。</p>
                    </div>
                    <span className="studio-chip">{referenceImageCount + referenceVideoCount + referenceAudioCount + referenceBgmCount} 个素材</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">参考图</label>
                      <input
                        type="number"
                        value={referenceImageCount}
                        min={0}
                        max={12}
                        onChange={(e) => setReferenceImageCount(Math.max(0, Math.min(12, Number(e.target.value) || 0)))}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">参考视频（运镜/转场）</label>
                      <input
                        type="number"
                        value={referenceVideoCount}
                        min={0}
                        max={3}
                        onChange={(e) => setReferenceVideoCount(Math.max(0, Math.min(3, Number(e.target.value) || 0)))}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">音色参考数量</label>
                      <input
                        type="number"
                        value={referenceAudioCount}
                        min={0}
                        max={4}
                        onChange={(e) => setReferenceAudioCount(Math.max(0, Math.min(4, Number(e.target.value) || 0)))}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">BGM 参考数量</label>
                      <input
                        type="number"
                        value={referenceBgmCount}
                        min={0}
                        max={3}
                        onChange={(e) => setReferenceBgmCount(Math.max(0, Math.min(3, Number(e.target.value) || 0)))}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={saveProject}
                    disabled={saving}
                    className="studio-button studio-secondary px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {saving ? "保存中..." : "保存"}
                  </button>
                  <button
                    onClick={generatePrompt}
                    disabled={generating || !durationSeconds || !primaryScene || !secondaryScene}
                    className={`studio-button studio-primary px-6 py-2 text-sm disabled:opacity-50 ${generating ? "studio-loading" : ""}`}
                  >
                    {generating ? "生成中..." : "生成分镜 Prompt"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Results */}
          <div className="space-y-6">
            {/* Prompt Result */}
            <div className="studio-card studio-panel-in p-6">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="studio-label">PROMPT OUTPUT</p>
                  <h2 className="text-lg font-semibold">最终视频 Prompt</h2>
                  <p className="mt-1 text-xs text-gray-500">{promptReady ? "完整视频 Prompt" : "等待生成"}</p>
                </div>
                {project.finalPromptMarkdown && (
                  <button
                    onClick={copyPrompt}
                    className="studio-button studio-secondary px-3 py-1 text-xs"
                  >
                    {copied ? "已复制" : "复制 Markdown"}
                  </button>
                )}
              </div>
              {project.finalPromptMarkdown ? (
                <pre className="studio-pre whitespace-pre-wrap rounded-md p-4 text-sm font-mono max-h-96 overflow-auto">
                  {project.finalPromptMarkdown}
                </pre>
              ) : (
                <div className="studio-card-quiet p-5 text-sm text-gray-500">点击“生成 Prompt”开始创作</div>
              )}
            </div>

            <div className="studio-card studio-panel-in p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="studio-label">AI REVISION</p>
                  <h2 className="text-lg font-semibold">AI 改稿对话</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    基于当前完整 Prompt 继续追问、调整节奏、角色、台词、镜头和参考素材
                  </p>
                </div>
                <span className={promptReady ? "studio-chip" : "studio-chip studio-chip-warm"}>
                  {promptReady ? textProviderLabel : "先生成 Prompt"}
                </span>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  "强化悬疑反转",
                  "检查参考图引用",
                  "减少旁白",
                  "重写结尾",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setChatInput(suggestion)}
                    disabled={!promptReady || chatLoading}
                    className="studio-button studio-secondary min-h-8 px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div className="studio-card-quiet mb-3 max-h-64 space-y-3 overflow-auto p-3">
                {chatMessages.length === 0 ? (
                  <p className="text-sm leading-6 text-gray-500">
                    生成完整 Prompt 后，可以在这里要求 AI 修改，比如“把主角改成双人对峙”“减少旁白”“强化悬疑反转”“检查音色参考是否符合规则”。
                  </p>
                ) : (
                  chatMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`rounded-md p-3 text-sm leading-6 ${
                        message.role === "user"
                          ? "ml-6 border border-rose-100 bg-rose-50 text-rose-950"
                          : "mr-6 border border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      <div className="studio-label mb-1">
                        {message.role === "user" ? "你" : "AI 改稿助手"}
                      </div>
                      {message.content}
                    </div>
                  ))
                )}
                {chatLoading && (
                  <div className="studio-loading mr-6 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-600">
                    AI 正在阅读当前 Prompt 并改稿...
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={!promptReady || chatLoading}
                  rows={3}
                  placeholder={promptReady ? "输入修改要求或问题，例如：把结尾改成开放式反转，并保持参考图编号不变" : "请先生成完整 Prompt"}
                  className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-gray-500">
                    AI 会返回修改建议和新版完整 Prompt；确认后再应用到生成结果。
                  </p>
                  <button
                    onClick={sendPromptChat}
                    disabled={!promptReady || !chatInput.trim() || chatLoading}
                    className={`studio-button studio-primary px-4 py-2 text-sm disabled:opacity-50 ${chatLoading ? "studio-loading" : ""}`}
                  >
                    {chatLoading ? "改稿中..." : "发送给 AI"}
                  </button>
                </div>
              </div>

              {pendingRevisedPrompt && (
                <div className="mt-4 rounded-md border border-rose-100 bg-rose-50/60 p-4">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="studio-label">REVISED PROMPT</p>
                      <div className="text-sm font-semibold text-rose-950">AI 返回的新版 Prompt</div>
                      <p className="mt-1 text-xs text-rose-800">应用后会覆盖上方“生成结果”的完整 Markdown。</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          const ok = await copyText(pendingRevisedPrompt);
                          if (!ok) setError("复制失败，请手动选中文本复制");
                        }}
                        className="studio-button studio-secondary px-3 py-1.5 text-xs"
                      >
                        复制新版
                      </button>
                      <button
                        onClick={applyRevisedPrompt}
                        disabled={applyingChatPrompt}
                        className="studio-button studio-primary px-3 py-1.5 text-xs disabled:opacity-50"
                      >
                        {applyingChatPrompt ? "应用中..." : "应用到生成结果"}
                      </button>
                    </div>
                  </div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-white/80 p-3 text-xs leading-5 text-gray-700">
                    {pendingRevisedPrompt}
                  </pre>
                </div>
              )}
            </div>

            {project.referenceAudioMarkdown && (
              <div className="studio-card studio-panel-in p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="studio-label">REFERENCE AUDIO SOURCES</p>
                    <h2 className="text-lg font-semibold">参考音频出处</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      单独记录人物音色、旁白音色或 BGM 来源，不写进最终视频 Prompt
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const ok = await copyText(project.referenceAudioMarkdown);
                      if (!ok) setError("复制失败，请手动选中文本复制");
                    }}
                    className="studio-button studio-secondary px-3 py-1.5 text-xs"
                  >
                    复制出处
                  </button>
                </div>
                <pre className="studio-pre whitespace-pre-wrap rounded-md p-4 text-sm font-mono max-h-72 overflow-auto">
                  {project.referenceAudioMarkdown}
                </pre>
              </div>
            )}

            {/* Reference Images */}
            {project.referenceImages.length > 0 && (
              <div className="studio-card studio-panel-in p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="studio-label">REFERENCE IMAGE PROMPTS</p>
                    <h2 className="text-lg font-semibold">
                      参考图 Prompt ({project.referenceImages.length})
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      逐条选择需要生成的参考图
                    </p>
                  </div>
                  <span className="studio-chip">{generatedImagesCount} 已生成</span>
                </div>
                <div className="studio-motion-grid space-y-4">
                  {project.referenceImages.map((img, index) => (
                    <div
                      key={img.id}
                      className="studio-ref-card rounded-md border border-gray-200 bg-white p-4"
                      style={{ animationDelay: `${index * 55}ms` }}
                    >
                      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <span className="studio-chip mr-2">
                            {kindLabel[img.kind] || img.kind}
                          </span>
                          <span className="text-sm font-semibold">
                            #{img.index} {img.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={img.quality}
                            onChange={async (e) => {
                              const newQuality = e.target.value;
                              const res = await fetch(`/api/reference-images/${img.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ quality: newQuality }),
                              });
                              const data = await res.json();
                              if (!res.ok) {
                                setError(data.error || "Quality update failed");
                                return;
                              }
                              setProject((current) =>
                                current
                                  ? {
                                      ...current,
                                      referenceImages: current.referenceImages.map((ri) =>
                                        ri.id === img.id ? { ...ri, quality: newQuality } : ri
                                      ),
                                    }
                                  : current
                              );
                            }}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            <option value="low">low</option>
                            <option value="medium">medium</option>
                            <option value="high">high</option>
                          </select>
                          <button
                            onClick={() => generateImage(img.id)}
                            disabled={img.generationStatus === "loading"}
                            className={`studio-button studio-primary px-3 py-1.5 text-xs disabled:opacity-50 ${img.generationStatus === "loading" ? "studio-loading" : ""}`}
                          >
                            {img.generationStatus === "loading"
                              ? "生成中..."
                              : img.generationStatus === "succeeded"
                              ? "重新生成"
                              : "按此 Prompt 生成图片"}
                          </button>
                        </div>
                      </div>
                      <p className="mb-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm leading-6 text-gray-700">{img.prompt}</p>
                      <button
                        onClick={async () => {
                          const ok = await copyText(img.prompt);
                          if (!ok) {
                            setError("复制失败，请手动选中文本复制");
                          }
                        }}
                        className="studio-button studio-secondary mb-3 px-3 py-1.5 text-xs"
                      >
                        复制 Prompt
                      </button>
                      {img.imagePath && (
                        <div className="mt-2">
                          <Image
                            src={img.imagePath}
                            alt={img.title}
                            width={img.size === "1536x1024" ? 1536 : 1024}
                            height={img.size === "1536x1024" ? 1024 : 1536}
                            sizes="(max-width: 1024px) 100vw, 520px"
                            unoptimized
                            className="h-auto max-w-full rounded-md border border-gray-200"
                          />
                        </div>
                      )}
                      {img.generationStatus === "failed" && (
                        <p className="mt-2 text-xs text-red-600">
                          生成失败，点击“重新生成”重试
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
          </>
        ) : (
          <VideoModificationPanel
            projectId={id}
            apiPayload={buildApiPayload()}
            onError={setError}
          />
        )}
      </main>
    </div>
  );
}
