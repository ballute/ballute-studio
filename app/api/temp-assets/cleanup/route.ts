import { NextRequest, NextResponse } from "next/server";
import { deleteGcsPaths, listGcsFilesByPrefix } from "@/lib/gcs-storage";

export const runtime = "nodejs";

const TTL_MS = 2 * 60 * 60 * 1000;

function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    throw new Error("CRON_SECRET 환경변수가 없습니다.");
  }

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

function extractTimestampFromFileName(fileName: string) {
  const firstPart = fileName.split("_")[0];
  const ts = Number(firstPart);

  if (!Number.isFinite(ts) || ts <= 0) {
    return null;
  }

  return ts;
}

function isExpiredByPath(path: string, now: number) {
  const fileName = path.split("/").pop();
  if (!fileName) return false;

  const ts = extractTimestampFromFileName(fileName);
  if (!ts) return false;

  return now - ts >= TTL_MS;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = Date.now();
    const allPaths = await listGcsFilesByPrefix();

    const expiredPaths = allPaths.filter((path) => isExpiredByPath(path, now));

    if (expiredPaths.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: allPaths.length,
        removed: 0,
        removedPaths: [],
      });
    }

    const removedPaths = await deleteGcsPaths(expiredPaths);

    return NextResponse.json({
      success: true,
      scanned: allPaths.length,
      removed: removedPaths.length,
      removedPaths,
    });
  } catch (error) {
    console.error("TEMP_ASSETS_CLEANUP_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "알 수 없는 cleanup 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
