export type GenAiResponsePart = {
  text?: string;
  thought?: boolean;
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
};

type ErrorLike = {
  cause?: unknown;
  code?: unknown;
  config?: {
    method?: unknown;
    url?: unknown;
  };
  message?: unknown;
  name?: unknown;
  response?: {
    data?: unknown;
    status?: unknown;
    statusText?: unknown;
  };
  stack?: unknown;
  status?: unknown;
};

function getInlineParts(parts: GenAiResponsePart[]) {
  return parts.filter((part) => Boolean(part.inlineData?.data));
}

function extractString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    const ownMessage = extractString(error.message);
    if (ownMessage) return ownMessage;
  }

  if (!error || typeof error !== "object") {
    return extractString(error);
  }

  const maybeError = error as ErrorLike;

  return (
    extractString(maybeError.message) ||
    extractString(maybeError.response?.statusText) ||
    null
  );
}

function extractCauseMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const cause = (error as ErrorLike).cause;
  if (!cause) {
    return null;
  }

  const nested = extractErrorMessage(cause);
  if (nested) {
    return nested;
  }

  return extractCauseMessage(cause);
}

export function pickGeneratedInlineImage(parts: GenAiResponsePart[]) {
  const inlineParts = getInlineParts(parts);
  const nonThoughtParts = inlineParts.filter((part) => !part.thought);

  return (
    nonThoughtParts[nonThoughtParts.length - 1]?.inlineData ||
    inlineParts[inlineParts.length - 1]?.inlineData ||
    null
  );
}

export function formatGenAiErrorMessage(error: unknown, fallback: string) {
  const message = extractErrorMessage(error) || fallback;
  const causeMessage = extractCauseMessage(error);
  const code =
    error && typeof error === "object"
      ? extractString((error as ErrorLike).code)
      : null;

  if (causeMessage && causeMessage !== message) {
    return `${message} (cause: ${causeMessage}${code ? ` / ${code}` : ""})`;
  }

  if (code && !message.includes(code)) {
    return `${message} (${code})`;
  }

  return message;
}

export function buildGenAiErrorLog(error: unknown) {
  if (error instanceof Error) {
    const err = error as Error & ErrorLike;
    return {
      name: err.name,
      message: err.message,
      cause: extractCauseMessage(err),
      code: err.code ?? null,
      status: err.status ?? err.response?.status ?? null,
      responseStatusText: err.response?.statusText ?? null,
      requestMethod: err.config?.method ?? null,
      requestUrl: err.config?.url ?? null,
      stack: err.stack?.split("\n").slice(0, 6).join("\n") ?? null,
    };
  }

  return { value: error };
}
