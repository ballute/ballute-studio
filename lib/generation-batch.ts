import { getAccessToken } from "@/lib/supabase";

type GenerationMode = "dig" | "fusion" | "refrun";

type ReserveResponse = {
  success?: boolean;
  status?: "queued" | "active";
  queuePosition?: number;
  activeCount?: number;
  maxActive?: number;
  message?: string;
  error?: string;
};

const POLL_INTERVAL_MS = 8000;
const BATCH_STORAGE_PREFIX = "generation-batch:";

type ReleaseGenerationBatchOptions = {
  accessToken?: string | null;
  keepalive?: boolean;
};

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getBatchStorageKey(mode: GenerationMode) {
  return `${BATCH_STORAGE_PREFIX}${mode}`;
}

export function persistGenerationBatch(
  mode: GenerationMode,
  batchId: string | null
) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedBatchId = (batchId || "").trim();
  const key = getBatchStorageKey(mode);

  if (!normalizedBatchId) {
    window.sessionStorage.removeItem(key);
    return;
  }

  window.sessionStorage.setItem(key, normalizedBatchId);
}

export function clearPersistedGenerationBatch(
  mode: GenerationMode,
  batchId?: string | null
) {
  if (typeof window === "undefined") {
    return;
  }

  const key = getBatchStorageKey(mode);
  const currentBatchId = window.sessionStorage.getItem(key);
  const normalizedBatchId = (batchId || "").trim();

  if (!normalizedBatchId || currentBatchId === normalizedBatchId) {
    window.sessionStorage.removeItem(key);
  }
}

export async function releasePersistedGenerationBatch(mode: GenerationMode) {
  if (typeof window === "undefined") {
    return;
  }

  const key = getBatchStorageKey(mode);
  const batchId = (window.sessionStorage.getItem(key) || "").trim();

  if (!batchId) {
    return;
  }

  await releaseGenerationBatchWithOptions(batchId);
  window.sessionStorage.removeItem(key);
}

export async function waitForGenerationBatch(params: {
  batchId: string | null;
  mode: GenerationMode;
  accessToken?: string | null;
  onQueued?: (position: number, maxActive: number) => void;
  onActive?: () => void;
}) {
  const { batchId, mode, accessToken: providedAccessToken, onQueued, onActive } =
    params;
  const normalizedBatchId = (batchId || "").trim();

  if (!normalizedBatchId) {
    throw new Error("세션 생성중입니다. 잠시 후 다시 시도해 주세요.");
  }

  let lastQueuedPosition: number | null = null;

  while (true) {
    let accessToken: string | null = null;

    try {
      accessToken = await getAccessToken();
    } catch {
      accessToken = providedAccessToken || null;
    }

    if (!accessToken) {
      throw new Error("로그인이 필요합니다.");
    }

    const res = await fetch("/api/generation-slots/reserve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        batchId: normalizedBatchId,
        mode,
      }),
    });

    const data = (await res.json().catch(() => null)) as ReserveResponse | null;

    if (!res.ok) {
      throw new Error(data?.error || "대기열 등록 중 오류가 발생했습니다.");
    }

    if (data?.status === "active") {
      onActive?.();
      return;
    }

    const queuePosition = Math.max(1, data?.queuePosition ?? 1);

    if (lastQueuedPosition !== queuePosition) {
      onQueued?.(queuePosition, data?.maxActive ?? 0);
      lastQueuedPosition = queuePosition;
    }

    await wait(POLL_INTERVAL_MS);
  }
}

export async function releaseGenerationBatchWithOptions(
  batchId: string | null,
  options: ReleaseGenerationBatchOptions = {}
) {
  const normalizedBatchId = (batchId || "").trim();

  if (!normalizedBatchId) {
    return;
  }

  try {
    let accessToken: string | null = null;

    try {
      accessToken = await getAccessToken();
    } catch {
      accessToken = options.accessToken || null;
    }

    if (!accessToken) {
      return;
    }

    await fetch("/api/generation-slots/release", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        batchId: normalizedBatchId,
      }),
      keepalive: options.keepalive ?? false,
    });
  } catch (error) {
    console.error("GENERATION_BATCH_RELEASE_ERROR:", error);
  }
}

export async function releaseGenerationBatch(batchId: string | null) {
  await releaseGenerationBatchWithOptions(batchId);
}
