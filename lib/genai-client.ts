import {
  GoogleGenAI,
  ThinkingLevel,
  type GoogleGenAIOptions,
} from "@google/genai";

type ServiceAccountKey = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
};

function parseServiceAccountKey(raw: string | undefined, label: string) {
  if (!raw?.trim()) {
    return null;
  }

  const parsed = JSON.parse(raw) as ServiceAccountKey;

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(`${label} 형식이 올바르지 않습니다.`);
  }

  return {
    ...parsed,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

function getVertexServiceAccountKey() {
  const raw =
    process.env.VERTEX_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    (process.env.GOOGLE_GENAI_USE_VERTEXAI === "true"
      ? process.env.GCS_SERVICE_ACCOUNT_KEY
      : undefined);

  return parseServiceAccountKey(raw, "Vertex AI 서비스 계정 JSON");
}

function getVertexAuthOptions(key: ServiceAccountKey | null) {
  if (key) {
    return {
      credentials: {
        client_email: key.client_email,
        private_key: key.private_key,
      },
    };
  }

  const keyFilename =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.VERTEX_SERVICE_ACCOUNT_KEY_FILE ||
    (process.env.GOOGLE_GENAI_USE_VERTEXAI === "true"
      ? process.env.GCS_SERVICE_ACCOUNT_KEY_FILE
      : undefined);

  return keyFilename ? { keyFilename } : undefined;
}

const useVertexAi =
  process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" ||
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
  Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY) ||
  Boolean(process.env.VERTEX_SERVICE_ACCOUNT_KEY) ||
  Boolean(process.env.VERTEX_SERVICE_ACCOUNT_KEY_FILE);

function createClient() {
  if (useVertexAi) {
    const serviceAccountKey = getVertexServiceAccountKey();
    const project =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCP_PROJECT_ID ||
      serviceAccountKey?.project_id;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

    if (!project) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required when Vertex AI is enabled.");
    }

    const options: GoogleGenAIOptions = {
      vertexai: true,
      project,
      location,
      googleAuthOptions: getVertexAuthOptions(serviceAccountKey),
    };

    return new GoogleGenAI(options);
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required when Vertex AI is disabled.");
  }

  return new GoogleGenAI({ apiKey });
}

export const ai = createClient();
export const isVertexAiEnabled = useVertexAi;
export const defaultImageSize = "2K";
export const imageGenerationModel =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";
export const imageGenerateHttpOptions = {
  timeout: useVertexAi ? 1000 * 60 * 3 : 1000 * 60 * 5,
  retryOptions: {
    attempts: useVertexAi ? 2 : 2,
  },
};
export const imageGenerateConfig = useVertexAi
  ? {
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL,
      },
    }
  : {};
