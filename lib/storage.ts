import { getAccessToken } from "@/lib/supabase";

export type TempAssetKind =
  | "faces"
  | "outfits"
  | "bgs"
  | "poses"
  | "references"
  | "outputs";

export type TempUploadResult = {
  path: string;
  bucket: string;
  fullPath: string;
  kind: TempAssetKind;
  size: number;
  mimeType: string;
  fileName: string;
  sessionId: string;
  userId: string;
  expiresAt: string;
};

export function makeSessionId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type SignedUploadResponse = TempUploadResult & {
  error?: string;
  uploadUrl: string;
};

export async function uploadTempAsset(params: {
  file: File;
  kind: TempAssetKind;
  sessionId: string;
}) {
  const { file, kind, sessionId } = params;

  const accessToken = await getAccessToken();
  const mimeType = file.type || "application/octet-stream";
  const signRes = await fetch("/api/temp-assets/sign-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      fileName: file.name,
      kind,
      mimeType,
      sessionId,
      size: file.size,
    }),
  });

  const signed = (await signRes.json().catch(() => null)) as
    | SignedUploadResponse
    | null;

  if (!signRes.ok || !signed?.uploadUrl) {
    throw new Error(signed?.error || "GCS 업로드 URL 발급 실패");
  }

  const uploadRes = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
    },
    body: file,
  }).catch(() => null);

  if (!uploadRes?.ok) {
    return uploadTempAssetViaServer({ file, kind, sessionId, accessToken });
  }

  return {
    path: signed.path,
    bucket: signed.bucket,
    fullPath: signed.fullPath,
    kind: signed.kind,
    size: signed.size,
    mimeType: signed.mimeType,
    fileName: signed.fileName,
    sessionId: signed.sessionId,
    userId: signed.userId,
    expiresAt: signed.expiresAt,
  } satisfies TempUploadResult;
}

async function uploadTempAssetViaServer(params: {
  accessToken: string;
  file: File;
  kind: TempAssetKind;
  sessionId: string;
}) {
  const { accessToken, file, kind, sessionId } = params;
  const formData = new FormData();

  formData.append("file", file);
  formData.append("kind", kind);
  formData.append("sessionId", sessionId);

  const res = await fetch("/api/temp-assets/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const data = (await res.json().catch(() => null)) as
    | (TempUploadResult & { error?: string })
    | null;

  if (!res.ok || !data?.path) {
    throw new Error(data?.error || "GCS 서버 업로드 실패");
  }

  return data satisfies TempUploadResult;
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
