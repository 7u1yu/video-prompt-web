import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { formatProviderError } from "@/lib/provider-errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const ALLOWED_QUALITIES = ["low", "medium", "high"] as const;
const ALLOWED_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;
type ImageQuality = (typeof ALLOWED_QUALITIES)[number];
type ImageSize = (typeof ALLOWED_SIZES)[number];

interface ApiSettings {
  imageProvider?: string;
  imageApiKey?: string;
  imageBaseUrl?: string;
  imageModel?: string;
}

interface GeneratedImageData {
  imageUrl?: string;
  b64?: string;
}

function getPollinationsSize(size: ImageSize) {
  if (size === "1024x1536") return { width: 1024, height: 1536 };
  if (size === "1536x1024") return { width: 1536, height: 1024 };
  return { width: 1024, height: 1024 };
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function getImageApiKey(settings: ApiSettings) {
  const userKey = settings.imageApiKey?.trim();
  if (userKey) return userKey;
  return process.env.ALLOW_SERVER_API_KEY_FALLBACK === "true" ? process.env.OPENAI_API_KEY || "" : "";
}

function getImageModel(settings: ApiSettings) {
  return settings.imageModel?.trim() || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
}

function stripDataUrl(dataUrl: string) {
  const marker = ";base64,";
  const markerIndex = dataUrl.indexOf(marker);
  return markerIndex >= 0 ? dataUrl.slice(markerIndex + marker.length) : dataUrl;
}

async function generateWithOpenAIImages({
  apiKey,
  baseURL,
  model,
  prompt,
  provider,
  size,
  quality,
}: {
  apiKey: string;
  baseURL?: string;
  model: string;
  prompt: string;
  provider: string;
  size: ImageSize;
  quality: ImageQuality;
}): Promise<GeneratedImageData> {
  const openai = new OpenAI({
    apiKey,
    ...(provider !== "openai" && baseURL ? { baseURL } : {}),
  });
  const response = await openai.images.generate({
    model,
    prompt,
    n: 1,
    size,
    quality,
    ...(provider === "openai" ? { output_format: "png" as const } : { response_format: "b64_json" as const }),
  });

  return {
    imageUrl: response.data?.[0]?.url,
    b64: response.data?.[0]?.b64_json,
  };
}

async function generateWithSiliconFlow({
  apiKey,
  baseURL,
  model,
  prompt,
  size,
}: {
  apiKey: string;
  baseURL: string;
  model: string;
  prompt: string;
  size: ImageSize;
}): Promise<GeneratedImageData> {
  const res = await fetch(`${baseURL.replace(/\/$/, "")}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      image_size: size,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || data.message || `SiliconFlow image request failed: ${res.status}`);
  }

  return {
    imageUrl: data.images?.[0]?.url,
  };
}

async function generateWithOpenRouter({
  apiKey,
  baseURL,
  model,
  prompt,
}: {
  apiKey: string;
  baseURL: string;
  model: string;
  prompt: string;
}): Promise<GeneratedImageData> {
  const res = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
      stream: false,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || data.message || `OpenRouter image request failed: ${res.status}`);
  }

  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (typeof imageUrl === "string" && imageUrl.startsWith("data:image/")) {
    return { b64: stripDataUrl(imageUrl) };
  }

  return { imageUrl };
}

async function generateWithPollinations({
  baseURL,
  model,
  prompt,
  size,
}: {
  baseURL: string;
  model: string;
  prompt: string;
  size: ImageSize;
}): Promise<GeneratedImageData> {
  const endpoint = (baseURL || "https://image.pollinations.ai").replace(/\/$/, "");
  const { width, height } = getPollinationsSize(size);
  const url = new URL(`${endpoint}/prompt/${encodeURIComponent(prompt)}`);
  url.searchParams.set("model", model || "flux");
  url.searchParams.set("width", String(width));
  url.searchParams.set("height", String(height));
  url.searchParams.set("nologo", "true");
  url.searchParams.set("enhance", "true");
  url.searchParams.set("seed", String(Date.now() % 1000000));
  return { imageUrl: url.toString() };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit({
    key: `generate-image:${session.userId}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.ok) {
    const response = rateLimitResponse(limit.resetAt);
    return NextResponse.json(response.body, response.init);
  }

  const refImage = await prisma.referenceImage.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!refImage || refImage.project.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const apiSettings = (body.apiSettings || {}) as ApiSettings;
  const imageProvider = apiSettings.imageProvider || "openai";
  const apiKey = getImageApiKey(apiSettings);
  const isFreeImageProvider = imageProvider === "pollinations";
  if (!isFreeImageProvider && (!apiKey || apiKey.startsWith("replace-with"))) {
    return NextResponse.json({ error: "请先在 API 设置中填写图片模型 API Key" }, { status: 500 });
  }

  if (!isFreeImageProvider && imageProvider !== "openai" && !apiSettings.imageBaseUrl?.trim()) {
    return NextResponse.json({ error: "请先填写图片模型 Base URL" }, { status: 500 });
  }

  // Update status to loading
  await prisma.referenceImage.update({
    where: { id },
    data: { generationStatus: "loading" },
  });

  const model = getImageModel(apiSettings);
  const quality: ImageQuality = ALLOWED_QUALITIES.includes(refImage.quality as ImageQuality)
    ? (refImage.quality as ImageQuality)
    : "medium";
  const size: ImageSize = ALLOWED_SIZES.includes(refImage.size as ImageSize)
    ? (refImage.size as ImageSize)
    : "1024x1536";

  try {
    const baseURL = apiSettings.imageBaseUrl?.trim() || "";
    const generated =
      imageProvider === "pollinations"
        ? await generateWithPollinations({ baseURL, model, prompt: refImage.prompt, size })
        : imageProvider === "siliconflow"
        ? await generateWithSiliconFlow({ apiKey, baseURL, model, prompt: refImage.prompt, size })
        : imageProvider === "openrouter"
        ? await generateWithOpenRouter({ apiKey, baseURL, model, prompt: refImage.prompt })
        : await generateWithOpenAIImages({
            apiKey,
            baseURL,
            model,
            prompt: refImage.prompt,
            provider: imageProvider,
            size,
            quality,
          });

    const imageUrl = generated.imageUrl;
    const b64 = generated.b64;

    if (!imageUrl && !b64) {
      throw new Error("OpenAI did not return image data");
    }

    const uploadDir = path.join(
      process.cwd(),
      "uploads",
      session.userId,
      refImage.projectId
    );
    await mkdir(uploadDir, { recursive: true });

    const fileName = [
      String(refImage.index).padStart(2, "0"),
      safeFilePart(refImage.kind) || "image",
      Date.now().toString(),
    ].join("-") + ".png";
    const filePath = path.join(uploadDir, fileName);

    if (b64) {
      await writeFile(filePath, Buffer.from(b64, "base64"));
    } else if (imageUrl) {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        throw new Error("Failed to download generated image");
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(filePath, buffer);
    }

    const imagePath = `/uploads/${session.userId}/${refImage.projectId}/${fileName}`;

    await prisma.referenceImage.update({
      where: { id },
      data: {
        generationStatus: "succeeded",
        imagePath,
      },
    });

    const updated = await prisma.referenceImage.findUnique({ where: { id } });
    return NextResponse.json({ referenceImage: updated });
  } catch (err: unknown) {
    await prisma.referenceImage.update({
      where: { id },
      data: { generationStatus: "failed" },
    });
    return NextResponse.json({ error: formatProviderError(err) }, { status: 500 });
  }
}
