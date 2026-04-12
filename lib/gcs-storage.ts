import { Storage } from "@google-cloud/storage";

const GCS_UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

type ServiceAccountKey = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

let cachedStorage: Storage | null = null;

function parseServiceAccountKey() {
  const raw =
    process.env.GCS_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    "";

  if (!raw.trim()) {
    return null;
  }

  const parsed = JSON.parse(raw) as ServiceAccountKey;

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GCS 서비스 계정 JSON 형식이 올바르지 않습니다.");
  }

  return {
    ...parsed,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

function getStorage() {
  if (cachedStorage) {
    return cachedStorage;
  }

  const key = parseServiceAccountKey();

  cachedStorage = new Storage(
    key
      ? {
          projectId:
            process.env.GCP_PROJECT_ID ||
            process.env.GOOGLE_CLOUD_PROJECT ||
            key.project_id,
          credentials: {
            client_email: key.client_email,
            private_key: key.private_key,
          },
        }
      : {
          projectId: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
        }
  );

  return cachedStorage;
}

export function getGcsBucketName() {
  const bucketName = process.env.GCS_BUCKET_NAME;

  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME 환경변수가 없습니다.");
  }

  return bucketName;
}

export function stripGcsPathPrefix(path: string) {
  if (!path) return path;

  const bucketName = getGcsBucketName();
  const gsPrefix = `gs://${bucketName}/`;
  const bucketPrefix = `${bucketName}/`;
  const legacyPrefix = "temp-inputs/";

  if (path.startsWith(gsPrefix)) return path.slice(gsPrefix.length);
  if (path.startsWith(bucketPrefix)) return path.slice(bucketPrefix.length);
  if (path.startsWith(legacyPrefix)) return path.slice(legacyPrefix.length);

  return path;
}

function getBucket() {
  return getStorage().bucket(getGcsBucketName());
}

export async function createGcsSignedUploadUrl(params: {
  path: string;
  contentType: string;
}) {
  const { path, contentType } = params;
  const file = getBucket().file(stripGcsPathPrefix(path));

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + GCS_UPLOAD_URL_TTL_MS,
    contentType,
  });

  return url;
}

export async function gcsPathToBase64(path: string) {
  const cleanedPath = stripGcsPathPrefix(path);

  if (!cleanedPath) {
    throw new Error("GCS 경로가 비어 있습니다.");
  }

  const [buffer] = await getBucket().file(cleanedPath).download();
  return buffer.toString("base64");
}

export async function uploadGcsBuffer(params: {
  path: string;
  buffer: Buffer;
  contentType: string;
}) {
  const { path, buffer, contentType } = params;
  const cleanedPath = stripGcsPathPrefix(path);

  if (!cleanedPath) {
    throw new Error("GCS 업로드 경로가 비어 있습니다.");
  }

  await getBucket().file(cleanedPath).save(buffer, {
    contentType,
    resumable: false,
  });
}

export async function deleteGcsPaths(paths: string[]) {
  const cleanedPaths = paths.map(stripGcsPathPrefix).filter(Boolean);

  const results = await Promise.allSettled(
    cleanedPaths.map((path) =>
      getBucket()
        .file(path)
        .delete({ ignoreNotFound: true })
    )
  );
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );

  if (rejected) {
    throw rejected.reason;
  }

  return cleanedPaths;
}

export async function listGcsFilesByPrefix(prefix = "") {
  const cleanedPrefix = stripGcsPathPrefix(prefix);
  const [files] = await getBucket().getFiles({ prefix: cleanedPrefix });

  return files.map((file) => file.name);
}

export async function deleteGcsPrefix(prefix: string) {
  const paths = await listGcsFilesByPrefix(prefix);

  if (!paths.length) {
    return [];
  }

  return deleteGcsPaths(paths);
}
