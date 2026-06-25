import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findFirst({
    where: { id, userId: session.userId },
    include: {
      referenceImages: { orderBy: { index: "asc" } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.project.findFirst({ where: { id, userId: session.userId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const project = await prisma.project.update({
    where: { id },
    data: {
      title: body.title,
      storyBrief: body.storyBrief,
      durationSeconds: body.durationSeconds,
      primaryScene: body.primaryScene,
      secondaryScene: body.secondaryScene,
      aspectRatio: body.aspectRatio,
      subtitleMode: body.subtitleMode,
      dialogueMode: body.dialogueMode,
      voiceoverMode: body.voiceoverMode,
      referenceImageCount: body.referenceImageCount,
      referenceVideoCount: body.referenceVideoCount,
      referenceAudioCount: body.referenceAudioCount,
      referenceBgmCount: body.referenceBgmCount,
      stylePreset: body.stylePreset,
      cameraMotionStyle: body.cameraMotionStyle,
      finalPromptMarkdown: body.finalPromptMarkdown,
      referenceAudioMarkdown: body.referenceAudioMarkdown,
    },
  });

  return NextResponse.json({ project });
}
