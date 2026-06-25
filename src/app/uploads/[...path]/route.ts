import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params;
  const session = await getSession();
  if (!session.userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Ensure user can only access their own uploads
  if (pathParts[0] !== session.userId) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (
    pathParts.length < 3 ||
    pathParts.some((part) => !part || part === "." || part === ".." || path.isAbsolute(part))
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const userUploadRoot = path.resolve(process.cwd(), "uploads", session.userId);
  const filePath = path.resolve(process.cwd(), "uploads", ...pathParts);

  if (filePath !== userUploadRoot && !filePath.startsWith(`${userUploadRoot}${path.sep}`)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
