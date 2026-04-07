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

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function waitForGenerationBatch(params: {
  batchId: string | null;
  mode: GenerationMode;
  onQueued?: (position: number, maxActive: number) => void;
  onActive?: () => void;
}) {
  const { batchId, mode, onQueued, onActive } = params;
  const normalizedBatchId = (batchId || "").trim();

  if (!normalizedBatchId) {
    throw new Error("세션 생성중입니다. 잠시 후 다시 시도해 주세요.");
  }

  const accessToken = await getAccessToken();
  let lastQueuedPosition: number | null = null;

  while (true) {
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

export async function releaseGenerationBatch(batchId: string | null) {
  const normalizedBatchId = (batchId || "").trim();

  if (!normalizedBatchId) {
    return;
  }

  try {
    const accessToken = await getAccessToken();

    await fetch("/api/generation-slots/release", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        batchId: normalizedBatchId,
      }),
    });
  } catch (error) {
    console.error("GENERATION_BATCH_RELEASE_ERROR:", error);
  }
}
