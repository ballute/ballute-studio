import { GoogleGenAI } from "@google/genai";

const useVertexAi =
  process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" ||
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);

function createClient() {
  if (useVertexAi) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

    if (!project) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required when Vertex AI is enabled.");
    }

    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
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
export const imageGenerateHttpOptions = {
  timeout: useVertexAi ? 1000 * 60 * 10 : 1000 * 60 * 5,
  retryOptions: {
    attempts: useVertexAi ? 3 : 2,
  },
};
