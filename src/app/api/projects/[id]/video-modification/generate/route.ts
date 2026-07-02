import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { formatProviderError } from "@/lib/provider-errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import {
  buildVideoModificationRequest,
  extractStoryboardRanges,
  validateVideoModificationResult,
  type VideoModificationResult,
} from "@/lib/video-modification";

interface ApiSettings {
  textProvider?: string;
  textApiKey?: string;
  textBaseUrl?: string;
  textModel?: string;
}

const MAX_STORYBOARD_LENGTH = 50_000;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "changeSummary",
    "finalModificationPromptMarkdown",
    "referenceImagePrompts",
    "audioReferences",
  ],
  properties: {
    changeSummary: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "original",
          "replacement",
          "shots",
          "referenceLabel",
        ],
        properties: {
          type: {
            type: "string",
            enum: ["character", "prop", "scene", "voice", "bgm"],
          },
          original: { type: "string" },
          replacement: { type: "string" },
          shots: { type: "array", items: { type: "string" } },
          referenceLabel: { type: "string" },
        },
      },
    },
    finalModificationPromptMarkdown: { type: "string" },
    referenceImagePrompts: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "kind", "title", "prompt"],
        properties: {
          index: { type: "integer" },
          kind: {
            type: "string",
            enum: ["character", "scene", "prop"],
          },
          title: { type: "string" },
          prompt: { type: "string" },
        },
      },
    },
    audioReferences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "index",
          "kind",
          "title",
          "sourceWork",
          "sourceCharacterOrTrack",
          "usage",
        ],
        properties: {
          index: { type: "integer" },
          kind: { type: "string", enum: ["voice", "bgm"] },
          title: { type: "string" },
          sourceWork: { type: "string" },
          sourceCharacterOrTrack: { type: "string" },
          usage: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `你是专业的视频局部修改导演。用户会提供一份包含时间段和镜头内容的原视频分镜稿。

你的任务不是重写剧情，而是自动精选最值得替换的主要人物、关键道具、核心场景、旁白音色或背景音乐，给出一套完整、可执行的视频修改方案。

强制规则：
- 无论原稿多短，都必须主动提出至少一项具体的人物、道具或场景视觉替换；禁止返回空的 changeSummary 或 referenceImagePrompts，禁止回答“没有可修改内容”。
- 严格保留原剧情顺序、视频时长、镜头数量、每个时间段、人物数量、动作、表情节奏、站位、移动轨迹、空间关系、剪辑节奏和运镜。
- 场景可以替换，但新场景必须支持原有动作、站位、道具关系和镜头轨迹。
- 不要把所有元素都改掉，只精选对视觉或听觉提升最大的关键项。
- finalModificationPromptMarkdown 必须参考用户给出的专业修改模板，按“全局保留、人物替换、道具替换、场景替换、音色/BGM、逐镜时间线、保留与禁止”组织；没有对应改动的章节可以省略。
- 每个原分镜时间段必须原样出现在最终 Prompt，并逐镜写清“保留什么、仅替换什么”。
- 每个替换人物、道具、场景使用参考图编号；每个音色或 BGM 使用参考音频编号。编号必须贴近对象，且每个素材至少在正文中使用一次。
- referenceImagePrompts 只包含实际替换的人物、道具、场景。标题必须是具体对象名，禁止“主角”“关键道具”“补充场景”等占位名。
- 人物生图 Prompt 必须直接描述具体新形象，并包含左侧面部特写、右侧正面/侧面/背面全身三视图；场景和道具绝对不能包含人物特写或三视图。
- 道具 Prompt 写清外观、材质、尺寸、磨损、光泽和背景；场景 Prompt 写清空间、建筑/陈设、光线、色彩、构图和可承载的动作关系。
- 音色必须引用与原对白语言一致的具体影视/动画作品角色；BGM必须引用具体影视配乐或现有音乐曲目，不得写“原创BGM”“自选音乐”。
- 不新增剧情解释、人物、动作、转场、字幕、文字、水印、logo或额外画面元素。
- 不输出参考视频生成 Prompt，不声称已经生成图片、音频或视频。`;

function parseJson(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced?.[1] || trimmed) as VideoModificationResult;
}

function getTextApiKey(settings: ApiSettings) {
  const userKey = settings.textApiKey?.trim();
  if (userKey) return userKey;
  return process.env.ALLOW_SERVER_API_KEY_FALLBACK === "true"
    ? process.env.OPENAI_API_KEY || ""
    : "";
}

function getTextModel(settings: ApiSettings) {
  return settings.textModel?.trim() || process.env.OPENAI_TEXT_MODEL || "gpt-5.5";
}

async function generateWithOpenAI(
  apiKey: string,
  model: string,
  userPrompt: string
) {
  const openai = new OpenAI({ apiKey });
  const response = await openai.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    text: {
      format: {
        type: "json_schema",
        name: "video_modification_prompt",
        strict: true,
        schema: responseSchema,
      },
    },
  });
  if (!response.output_text) {
    throw new Error("模型没有返回视频修改方案");
  }
  return parseJson(response.output_text);
}

async function generateWithCompatible(
  apiKey: string,
  baseURL: string,
  model: string,
  userPrompt: string
) {
  const openai = new OpenAI({ apiKey, baseURL });
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${userPrompt}\n\n只返回JSON，不要代码块。字段必须为 changeSummary、finalModificationPromptMarkdown、referenceImagePrompts、audioReferences。`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.75,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("模型没有返回视频修改方案");
  }
  return parseJson(content);
}

function isProviderError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /quota|429|billing|API Key|Unauthorized|401|403|network|ECONN|timeout/i.test(
    error.message
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit({
    key: `video-modification:${session.userId}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.ok) {
    const response = rateLimitResponse(limit.resetAt);
    return NextResponse.json(response.body, response.init);
  }

  const project = await prisma.project.findFirst({
    where: { id, userId: session.userId },
    select: { id: true, title: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const sourceStoryboard = String(body.sourceStoryboard || "").trim();
  if (!sourceStoryboard) {
    return NextResponse.json({ error: "请先粘贴或上传分镜剧情稿" }, { status: 400 });
  }
  if (sourceStoryboard.length > MAX_STORYBOARD_LENGTH) {
    return NextResponse.json(
      { error: "分镜稿不能超过 50000 个字符" },
      { status: 400 }
    );
  }
  const ranges = extractStoryboardRanges(sourceStoryboard);
  if (ranges.length === 0) {
    return NextResponse.json(
      { error: "未识别到时间段，请使用 00:00–00:03 格式填写每个分镜" },
      { status: 400 }
    );
  }

  const apiSettings = (body.apiSettings || {}) as ApiSettings;
  const provider = apiSettings.textProvider || "openai";
  const apiKey = getTextApiKey(apiSettings);
  if (!apiKey || apiKey.startsWith("replace-with")) {
    return NextResponse.json(
      { error: "请先在 API 设置中填写文本模型 API Key" },
      { status: 500 }
    );
  }
  if (provider !== "openai" && !apiSettings.textBaseUrl?.trim()) {
    return NextResponse.json(
      { error: "请先填写文本模型 Base URL" },
      { status: 500 }
    );
  }

  const model = getTextModel(apiSettings);
  const basePrompt = `项目：${project.title}
原视频分镜数量：${ranges.length}
原视频分镜稿：

${sourceStoryboard}

请自动精选关键替换项并生成完整方案。不得遗漏以下时间段：
${ranges.join("\n")}`;

  try {
    let result: VideoModificationResult | null = null;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const userPrompt = buildVideoModificationRequest(
        basePrompt,
        attempt,
        attempt === 1
          ? undefined
          : lastError instanceof Error
            ? lastError.message
            : "上一版格式不完整"
      );
      try {
        const generated =
          provider === "openai"
            ? await generateWithOpenAI(apiKey, model, userPrompt)
            : await generateWithCompatible(
                apiKey,
                apiSettings.textBaseUrl?.trim() || "",
                model,
                userPrompt
              );
        result = validateVideoModificationResult(generated, sourceStoryboard);
        break;
      } catch (error) {
        lastError = error;
        if (isProviderError(error) || attempt === 3) throw error;
      }
    }
    if (!result) throw lastError || new Error("视频修改方案生成失败");

    const workspace = await prisma.videoModificationWorkspace.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        sourceStoryboard,
        changeSummaryJson: JSON.stringify(result.changeSummary),
        finalModificationPromptMarkdown:
          result.finalModificationPromptMarkdown,
        referenceImagePromptsJson: JSON.stringify(
          result.referenceImagePrompts
        ),
        audioReferencesJson: JSON.stringify(result.audioReferences),
      },
      update: {
        sourceStoryboard,
        changeSummaryJson: JSON.stringify(result.changeSummary),
        finalModificationPromptMarkdown:
          result.finalModificationPromptMarkdown,
        referenceImagePromptsJson: JSON.stringify(
          result.referenceImagePrompts
        ),
        audioReferencesJson: JSON.stringify(result.audioReferences),
      },
    });

    return NextResponse.json({
      workspace: {
        sourceStoryboard: workspace.sourceStoryboard,
        changeSummary: result.changeSummary,
        finalModificationPromptMarkdown:
          result.finalModificationPromptMarkdown,
        referenceImagePrompts: result.referenceImagePrompts,
        audioReferences: result.audioReferences,
        updatedAt: workspace.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatProviderError(error) },
      { status: 500 }
    );
  }
}
