import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { formatProviderError } from "@/lib/provider-errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

interface ApiSettings {
  textProvider?: string;
  textApiKey?: string;
  textBaseUrl?: string;
  textModel?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PromptChatResult {
  reply: string;
  revisedPromptMarkdown: string;
}

const chatResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "revisedPromptMarkdown"],
  properties: {
    reply: {
      type: "string",
      description: "给用户的中文回复，说明本轮修改或建议。",
    },
    revisedPromptMarkdown: {
      type: "string",
      description: "修改后的完整视频 Prompt Markdown。如果用户只是咨询不要求修改，则返回原始 Prompt。",
    },
  },
} as const;

const SYSTEM_PROMPT = `你是内置在“Video Prompt Studio”里的 Prompt 改稿助手。

工作方式：
- 你会收到当前项目的完整视频 Prompt，以及用户的修改要求或追问。
- 如果用户要求修改，请输出一版完整可复制的新版视频 Prompt，不要只输出片段。
- 如果用户只是咨询、解释、比较或提建议，reply 中回答问题，revisedPromptMarkdown 返回原始 Prompt。
- 必须保持当前产品约定的核心结构：参考素材清单、【整体风格】、【全局约束】、镜头一/二/三……连续镜头段落。
- revisedPromptMarkdown 要保留最终视频 Prompt 前面的参考素材清单，格式为“参考图1：...”“参考视频1用于...”“参考音频1为...”。
- 不要返回参考图生成 Prompt、参考音频详细出处或参考视频生成 Prompt。
- 禁止输出元信息块、【画幅】、画幅比例、分辨率、时间戳、参考图 Prompt、参考视频描述、参考音频描述。
- 参考视频只在正文运镜或转场句子后贴近写（参考视频X），不要生成参考视频 Prompt。
- 参考音频只在正文台词、旁白、人声或 BGM 句子后贴近写（参考音频X），不要输出音频出处。
- 不要把不同语言人物混用音色参考；中文对白用中文音色参考，日语对白用日语音色参考，英语对白用英语音色参考。BGM 必须对应“背景音乐”字段，不要当作人物音色。
- 镜头段落必须保持原视频篇幅节奏，但不要加入具体时间戳；镜头个数根据时长与剧情复杂度，不固定三段。
- 若原视频时长为 1-15 秒，新版 Prompt 约 900 个中文字符；若为 16-30 秒，约 1400 个中文字符；上下浮动约 15%。
- 每个镜头段落都必须使用固定字段格式：景别：、运镜：、内容：。如果本镜头有 BGM，再输出“背景音乐：”；如果本镜头有转场，再输出“转场：”。
- 景别要具体，例如远景、全景、中景、近景、特写、过肩中近景；运镜要具体，例如缓慢前推、侧向跟拍、手持贴近、环绕半圈、俯拍下降、遮挡转场、动作匹配转场。参考视频编号放在运镜或转场字段里。
- 运镜必须服务剧情和人物状态，转场必须有动作匹配、前景遮挡、光色变化、视线方向、道具特写、运动方向、声音节奏或情绪推进中的明确承接依据；不要写突兀跳切或无理由炫技转场。
- 参考图引用要贴近对象，例如“林澈（参考图1）”，不要集中堆在段末。`;

function parseJsonObject(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const jsonText = fenced?.[1] || trimmed;
  try {
    return JSON.parse(jsonText) as PromptChatResult;
  } catch {
    const objectMatch = jsonText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]) as PromptChatResult;
    }
    return {
      reply: trimmed || "模型已返回内容，但不是标准 JSON。请尝试让模型重新输出完整 Prompt。",
      revisedPromptMarkdown: "",
    };
  }
}

function stripAspectAndTimestampsMarkdown(markdown: string) {
  return markdown
    .trim()
    .replace(/^> - 画幅比例：.*\n?/gm, "")
    .replace(/\n*【画幅】[^\n]*\n?/g, "\n")
    .replace(/^\s*\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}\s*$/gm, "")
    .replace(/（?\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}）?/g, "")
    .replace(/，?画幅与本片一致/g, "")
    .replace(/，?画幅比例[^。；\n]*[。；]?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getTextApiKey(settings: ApiSettings) {
  const userKey = settings.textApiKey?.trim();
  if (userKey) return userKey;
  return process.env.ALLOW_SERVER_API_KEY_FALLBACK === "true" ? process.env.OPENAI_API_KEY || "" : "";
}

function getTextModel(settings: ApiSettings) {
  return settings.textModel?.trim() || process.env.OPENAI_TEXT_MODEL || "gpt-5.5";
}

function buildUserPrompt({
  currentPrompt,
  userMessage,
  history,
}: {
  currentPrompt: string;
  userMessage: string;
  history: ChatMessage[];
}) {
  const recentHistory = history
    .slice(-8)
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
    .join("\n\n");

  return `当前完整视频 Prompt：

${currentPrompt}

最近对话：
${recentHistory || "无"}

用户本轮要求：
${userMessage}

请只返回 JSON，不要包裹 markdown 代码块。字段必须是 reply、revisedPromptMarkdown。`;
}

async function chatWithOpenAIResponses({
  apiKey,
  model,
  userPrompt,
}: {
  apiKey: string;
  model: string;
  userPrompt: string;
}) {
  const openai = new OpenAI({ apiKey });
  const response = await openai.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    text: {
      format: {
        type: "json_schema",
        name: "video_prompt_chat",
        strict: true,
        schema: chatResponseSchema,
      },
    },
  });

  if (!response.output_text) {
    throw new Error("OpenAI returned empty response");
  }

  return parseJsonObject(response.output_text);
}

async function chatWithCompatibleProvider({
  apiKey,
  baseURL,
  model,
  userPrompt,
}: {
  apiKey: string;
  baseURL: string;
  model: string;
  userPrompt: string;
}) {
  const openai = new OpenAI({ apiKey, baseURL });
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: userPrompt },
  ];

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.45,
    });
  } catch {
    completion = await openai.chat.completions.create({
      model,
      messages: [
        messages[0],
        {
          role: "user" as const,
          content: `${userPrompt}\n\n如果无法输出 JSON，请先直接回答用户，并尽量给出新版完整 Prompt。`,
        },
      ],
      temperature: 0.45,
    });
  }

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Model provider returned empty response");
  }

  return parseJsonObject(content);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit({
    key: `prompt-chat:${session.userId}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.ok) {
    const response = rateLimitResponse(limit.resetAt);
    return NextResponse.json(response.body, response.init);
  }

  const project = await prisma.project.findFirst({ where: { id, userId: session.userId } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!project.finalPromptMarkdown?.trim()) {
    return NextResponse.json({ error: "请先生成完整 Prompt，再使用 AI 改稿对话" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const userMessage = String(body.message || "").trim();
  if (!userMessage) {
    return NextResponse.json({ error: "请输入修改要求或问题" }, { status: 400 });
  }

  const apiSettings = (body.apiSettings || {}) as ApiSettings;
  const textProvider = apiSettings.textProvider || "openai";
  const apiKey = getTextApiKey(apiSettings);
  if (!apiKey || apiKey.startsWith("replace-with")) {
    return NextResponse.json({ error: "请先在 API 设置中填写文本模型 API Key" }, { status: 500 });
  }

  if (textProvider !== "openai" && !apiSettings.textBaseUrl?.trim()) {
    return NextResponse.json({ error: "请先填写文本模型 Base URL" }, { status: 500 });
  }

  const model = getTextModel(apiSettings);
  const userPrompt = buildUserPrompt({
    currentPrompt: project.finalPromptMarkdown,
    userMessage,
    history: Array.isArray(body.history) ? body.history : [],
  });

  try {
    const result =
      textProvider === "openai"
        ? await chatWithOpenAIResponses({ apiKey, model, userPrompt })
        : await chatWithCompatibleProvider({
            apiKey,
            baseURL: apiSettings.textBaseUrl?.trim() || "",
            model,
            userPrompt,
          });

    return NextResponse.json({
      reply: result.reply?.trim() || "已完成。",
      revisedPromptMarkdown: stripAspectAndTimestampsMarkdown(
        result.revisedPromptMarkdown?.trim() || project.finalPromptMarkdown
      ),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: formatProviderError(err) }, { status: 500 });
  }
}
