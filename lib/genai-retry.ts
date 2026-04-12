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

export async function withGenAiRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
) {
  const maxRetries = options.maxRetries ?? 2;
  const maxAttempts = maxRetries + 1;
  const baseDelayMs = options.baseDelayMs ?? 900;
  let lastReason = "unknown retryable failure";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastReason = describeFailure(error);
      const retryable = isRetryableGenAiFailure(error);

      if (!retryable) {
        throw error;
      }

      if (attempt >= maxAttempts) {
        throw new GenAiRetryExhaustedError(
          options.label,
          attempt,
          lastReason
        );
      }

      console.warn(
        `${options.label}_GENAI_RETRY: attempt ${attempt}/${maxAttempts} failed: ${lastReason}`
      );
      await sleep(baseDelayMs * attempt);
    }
  }

  throw new GenAiRetryExhaustedError(options.label, maxAttempts, lastReason);
}
