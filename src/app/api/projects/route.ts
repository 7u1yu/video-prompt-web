import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      storyBrief: true,
      durationSeconds: true,
      primaryScene: true,
      secondaryScene: true,
      aspectRatio: true,
      subtitleMode: true,
      dialogueMode: true,
      voiceoverMode: true,
      referenceImageCount: true,
      referenceVideoCount: true,
      referenceAudioCount: true,
      referenceBgmCount: true,
      stylePreset: true,
      finalPromptMarkdown: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { referenceImages: true } },
    },
  });

  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const project = await prisma.project.create({
    data: {
      userId: session.userId,
      title: body.title || "Untitled Project",
      storyBrief: body.storyBrief || "",
      durationSeconds: body.durationSeconds || 0,
      primaryScene: body.primaryScene || "漫剧",
      secondaryScene: body.secondaryScene || "",
      aspectRatio: body.aspectRatio || "9:16",
      subtitleMode: body.subtitleMode || "none",
      dialogueMode: body.dialogueMode || "auto",
      voiceoverMode: body.voiceoverMode || "auto",
      referenceImageCount: body.referenceImageCount ?? 6,
      referenceVideoCount: body.referenceVideoCount ?? 0,
      referenceAudioCount: body.referenceAudioCount ?? 0,
      referenceBgmCount: body.referenceBgmCount ?? 0,
      stylePreset: body.stylePreset || "",
      cameraMotionStyle: body.cameraMotionStyle || "",
    },
  });

  return NextResponse.json({ project }, { status: 201 });
}
