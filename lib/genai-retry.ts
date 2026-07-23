const retryableStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const retryableMessageSignals = [
  "unavailable",
  "resource_exhausted",
  "deadline_exceeded",
  "high demand",
  "temporarily",
  "temporary",
  "timeout",
  "timed out",
  "etimedout",
  "econnreset",
  "rate limit",
  "overloaded",
];

export const pointNotChargedNotice = "포인트는 차감되지 않았습니다.";

type RetryableErrorLike = {
  cause?: unknown;
  code?: unknown;
  message?: unknown;
  name?: unknown;
  response?: {
    data?: unknown;
    status?: unknown;
    statusText?: unknown;
  };
  status?: unknown;
};

type RetryOptions = {
  label: string;
  maxRetries?: number;
  baseDelayMs?: number;
};

export class EmptyGenAiImageError extends Error {
  constructor(label: string) {
    super(`${label} 이미지 생성 결과가 비어 있습니다.`);
    this.name = "EmptyGenAiImageError";
  }
}

export class GenAiRetryExhaustedError extends Error {
  attempts: number;
  reason: string;
  status = 503;

  constructor(label: string, attempts: number, reason: string) {
    super(
      `${label} 처리 중 AI 서버가 일시적으로 혼잡하거나 응답 생성에 실패했습니다. ${pointNotChargedNotice} 잠시 후 다시 시도해 주세요.`
    );
    this.name = "GenAiRetryExhaustedError";
    this.attempts = attempts;
    this.reason = reason;
  }
}

export function withPointNotChargedNotice(message: string) {
  return message.includes(pointNotChargedNotice)
    ? message
    : `${message} ${pointNotChargedNotice}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asRetryableError(error: unknown): RetryableErrorLike | null {
  return error && typeof error === "object"
    ? (error as RetryableErrorLike)
    : null;
}

function stringifySignal(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (!value) return "";

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractStatus(error: unknown) {
  const retryableError = asRetryableError(error);
  const status = retryableError?.status ?? retryableError?.response?.status;

  return typeof status === "number" ? status : null;
}

function describeFailure(error: unknown) {
  if (!error) return "empty response";

  const retryableError = asRetryableError(error);
  const signals = [
    retryableError?.name,
    retryableError?.code,
    retryableError?.message,
    retryableError?.response?.status,
    retryableError?.response?.statusText,
    retryableError?.response?.data,
    retryableError?.cause,
  ]
    .map(stringifySignal)
    .filter(Boolean);

  if (signals.length) {
    return signals.join(" | ").slice(0, 600);
  }

  return stringifySignal(error).slice(0, 600);
}

export function isRetryableGenAiFailure(error: unknown) {
  if (error instanceof EmptyGenAiImageError) {
    return true;
  }

  const status = extractStatus(error);
  if (status && retryableStatuses.has(status)) {
    return true;
  }

  const failureText = describeFailure(error).toLowerCase();
  return retryableMessageSignals.some((signal) => failureText.includes(signal));
}

// 재시도 예산: 실패 응답이 오는 한 이 시간 안에서 계속 재시도한다.
// 429는 과금 0원이므로 자주 두드리는 게 이득 — 단 간격 없이 붙이면 같은 혼잡
// 순간에 그대로 부딪히고 구글이 뒤로 밀 수 있어 10초 간격 유지.
// route maxDuration 300s 안에서 생성 시간(~30s)을 감안한 안전 예산.
const RETRY_BUDGET_MS = 150000;
const RATE_LIMIT_INTERVAL_MS = 10000;

export async function withGenAiRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
) {
  const baseDelayMs = options.baseDelayMs ?? 5000;
  const startedAt = Date.now();
  let lastReason = "unknown retryable failure";

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastReason = describeFailure(error);
      const retryable = isRetryableGenAiFailure(error);

      if (!retryable) {
        throw error;
      }

      const rateLimited =
        extractStatus(error) === 429 ||
        lastReason.toLowerCase().includes("resource_exhausted");
      const delayMs = rateLimited
        ? RATE_LIMIT_INTERVAL_MS
        : Math.min(baseDelayMs * attempt, 15000);

      if (Date.now() - startedAt + delayMs >= RETRY_BUDGET_MS) {
        throw new GenAiRetryExhaustedError(options.label, attempt, lastReason);
      }

      console.warn(
        `${options.label}_GENAI_RETRY: attempt ${attempt} failed (${Math.round(
          (Date.now() - startedAt) / 1000
        )}s 경과): ${lastReason}`
      );
      await sleep(delayMs);
    }
  }
}
