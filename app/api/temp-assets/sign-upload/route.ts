import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/server-api";
import {
  createGcsSignedUploadUrl,
  getGcsBucketName,
} from "@/lib/gcs-storage";

export const runtime = "nodejs";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ALLOWED_KINDS = new Set([
  "faces",
  "outfits",
  "bgs",
  "poses",
  "references",
  "outputs",
]);

type SignUploadBody = {
  fileName?: string;
  kind?: string;
  mimeType?: string;
  sessionId?: string;
  size?: number;
};

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getExtension(fileName: string, mimeType: string) {
  const byName = fileName.split(".").pop()?.toLowerCase();
  if (byName) return byName;

  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export async function POST(req: Request) {
  try {
    const user = await authenticateApiRequest(req);
    const body = (await req.json()) as SignUploadBody;
    const kind = (body.kind || "").trim();
    const sessionId = (body.sessionId || "").trim();
    const originalFileName = (body.fileName || "upload").trim();
    const mimeType = (body.mimeType || "application/octet-stream").trim();

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId가 필요합니다." },
        { status: 400 }
      );
    }

    if (!ALLOWED_KINDS.has(kind)) {
      return NextResponse.json(
        { error: "지원하지 않는 업로드 종류입니다." },
        { status: 400 }
      );
    }

    const now = Date.now();
    const ext = getExtension(originalFileName, mimeType);
    const safeName =
      sanitizeFileName(originalFileName.replace(/\.[^/.]+$/, "")) || "upload";
    const uniqueName = `${now}_${Math.random()
      .toString(36)
      .slice(2, 8)}_${safeName}.${ext}`;
    const path = `${user.id}/${sessionId}/${kind}/${uniqueName}`;
    const uploadUrl = await createGcsSignedUploadUrl({ path, contentType: mimeType });
    const bucket = getGcsBucketName();

    return NextResponse.json({
      uploadUrl,
      path,
      bucket,
      fullPath: `gs://${bucket}/${path}`,
      kind,
      size: Number(body.size || 0),
      mimeType,
      fileName: originalFileName,
      sessionId,
      userId: user.id,
      expiresAt: new Date(now + TWO_HOURS_MS).toISOString(),
    });
  } catch (error) {
    console.error("TEMP_ASSETS_SIGN_UPLOAD_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "업로드 URL 발급 실패";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
