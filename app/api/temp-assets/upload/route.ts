import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/server-api";
import { getGcsBucketName, uploadGcsBuffer } from "@/lib/gcs-storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ALLOWED_KINDS = new Set([
  "faces",
  "outfits",
  "bgs",
  "poses",
  "references",
  "outputs",
]);

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
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const kind = String(formData.get("kind") || "").trim();
    const sessionId = String(formData.get("sessionId") || "").trim();

    if (!file) {
      return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
    }

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
    const mimeType = file.type || "application/octet-stream";
    const ext = getExtension(file.name, mimeType);
    const safeName =
      sanitizeFileName(file.name.replace(/\.[^/.]+$/, "")) || "upload";
    const uniqueName = `${now}_${Math.random()
      .toString(36)
      .slice(2, 8)}_${safeName}.${ext}`;
    const path = `${user.id}/${sessionId}/${kind}/${uniqueName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await uploadGcsBuffer({ path, buffer, contentType: mimeType });

    const bucket = getGcsBucketName();

    return NextResponse.json({
      path,
      bucket,
      fullPath: `gs://${bucket}/${path}`,
      kind,
      size: file.size,
      mimeType,
      fileName: file.name,
      sessionId,
      userId: user.id,
      expiresAt: new Date(now + TWO_HOURS_MS).toISOString(),
    });
  } catch (error) {
    console.error("TEMP_ASSETS_UPLOAD_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "GCS 업로드 실패";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
