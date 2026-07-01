import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const MAX_STORYBOARD_LENGTH = 50_000;

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeWorkspace(workspace: {
  sourceStoryboard: string;
  changeSummaryJson: string;
  finalModificationPromptMarkdown: string;
  referenceImagePromptsJson: string;
  audioReferencesJson: string;
  updatedAt: Date;
} | null) {
  return {
    sourceStoryboard: workspace?.sourceStoryboard || "",
    changeSummary: parseJsonArray(workspace?.changeSummaryJson || "[]"),
    finalModificationPromptMarkdown:
      workspace?.finalModificationPromptMarkdown || "",
    referenceImagePrompts: parseJsonArray(
      workspace?.referenceImagePromptsJson || "[]"
    ),
    audioReferences: parseJsonArray(workspace?.audioReferencesJson || "[]"),
    updatedAt: workspace?.updatedAt?.toISOString() || null,
  };
}

async function getOwnedProject(id: string, userId: string) {
  return prisma.project.findFirst({
    where: { id, userId },
    select: { id: true },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await getOwnedProject(id, session.userId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const workspace = await prisma.videoModificationWorkspace.findUnique({
    where: { projectId: id },
  });
  return NextResponse.json({ workspace: serializeWorkspace(workspace) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await getOwnedProject(id, session.userId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.clear === true) {
    await prisma.videoModificationWorkspace.deleteMany({
      where: { projectId: id },
    });
    return NextResponse.json({ workspace: serializeWorkspace(null) });
  }

  const sourceStoryboard = String(body.sourceStoryboard || "").trim();
  if (sourceStoryboard.length > MAX_STORYBOARD_LENGTH) {
    return NextResponse.json(
      { error: "分镜稿不能超过 50000 个字符" },
      { status: 400 }
    );
  }

  const workspace = await prisma.videoModificationWorkspace.upsert({
    where: { projectId: id },
    create: { projectId: id, sourceStoryboard },
    update: { sourceStoryboard },
  });
  return NextResponse.json({ workspace: serializeWorkspace(workspace) });
}
