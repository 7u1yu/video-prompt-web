import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const ALLOWED_QUALITIES = ["low", "medium", "high"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refImage = await prisma.referenceImage.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!refImage || refImage.project.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const quality = String(body.quality || "");
  if (!ALLOWED_QUALITIES.includes(quality as (typeof ALLOWED_QUALITIES)[number])) {
    return NextResponse.json({ error: "Invalid quality" }, { status: 400 });
  }

  const referenceImage = await prisma.referenceImage.update({
    where: { id },
    data: { quality },
  });

  return NextResponse.json({ referenceImage });
}
