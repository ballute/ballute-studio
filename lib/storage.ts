import { supabase } from "@/lib/supabase";

export type TempAssetKind =
  | "faces"
  | "outfits"
  | "bgs"
  | "poses"
  | "references"
  | "outputs";

export type TempUploadResult = {
  path: string;
  bucket: "temp-inputs";
  fullPath: string;
  kind: TempAssetKind;
  size: number;
  mimeType: string;
  fileName: string;
  sessionId: string;
  userId: string;
  expiresAt: string;
};

const TEMP_INPUT_BUCKET = "temp-inputs";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getExtension(file: File) {
  const byName = file.name.split(".").pop()?.toLowerCase();
  if (byName) return byName;

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function makeSessionId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  return user.id;
}

export async function uploadTempAsset(params: {
  file: File;
  kind: TempAssetKind;
  sessionId: string;
}) {
  const { file, kind, sessionId } = params;

  const userId = await getCurrentUserId();
  const now = Date.now();
  const expiresAt = new Date(now + TWO_HOURS_MS).toISOString();

  const ext = getExtension(file);
  const safeName = sanitizeFileName(file.name.replace(/\.[^/.]+$/, ""));
  const uniqueName = `${now}_${Math.random().toString(36).slice(2, 8)}_${safeName}.${ext}`;
  const path = `${userId}/${sessionId}/${kind}/${uniqueName}`;

  const { error } = await supabase.storage
    .from(TEMP_INPUT_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

  if (error) {
    throw new Error(`스토리지 업로드 실패: ${error.message}`);
  }

  return {
    path,
    bucket: TEMP_INPUT_BUCKET,
    fullPath: `${TEMP_INPUT_BUCKET}/${path}`,
    kind,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    fileName: file.name,
    sessionId,
    userId,
    expiresAt,
  } satisfies TempUploadResult;
}

export async function uploadTempAssets(params: {
  files: File[];
  kind: TempAssetKind;
  sessionId: string;
}) {
  const { files, kind, sessionId } = params;
  return Promise.all(
    files.map((file) => uploadTempAsset({ file, kind, sessionId }))
  );
}

export async function removeTempPaths(paths: string[]) {
  if (!paths.length) return;

  const { error } = await supabase.storage
    .from(TEMP_INPUT_BUCKET)
    .remove(paths);

  if (error) {
    throw new Error(`스토리지 삭제 실패: ${error.message}`);
  }
}