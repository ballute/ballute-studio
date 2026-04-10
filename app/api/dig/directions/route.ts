import { NextResponse } from "next/server";
import { generateCreativeDirectionsWeb } from "@/lib/gemini-dig";
import {
  ApiError,
  authenticateApiRequest,
  ensureGenerationSlotActive,
  ensureUserHasPoints,
} from "@/lib/server-api";
import {
  buildGenAiErrorLog,
  formatGenAiErrorMessage,
} from "@/lib/genai-response";

const DIG_COST_PER_IMAGE = 50;
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const user = await authenticateApiRequest(req);
    await ensureUserHasPoints(user.id, DIG_COST_PER_IMAGE);

    const formData = await req.formData();

    const moodQuery = (formData.get("moodQuery") as string) || "";
    const countRaw = (formData.get("count") as string) || "4";
    const batchId = ((formData.get("batchId") as string) || "").trim();
    const count = Math.max(1, Math.min(8, Number(countRaw) || 4));

    if (!moodQuery.trim()) {
      return NextResponse.json(
        { error: "무드 키워드가 필요하다." },
        { status: 400 }
      );
    }

    await ensureGenerationSlotActive(user.id, batchId, "dig");

    const directions = await generateCreativeDirectionsWeb(moodQuery, count);

    return NextResponse.json({
      success: true,
      directions,
    });
  } catch (error) {
    console.error("DIG_DIRECTIONS_ERROR:", buildGenAiErrorLog(error));

    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = formatGenAiErrorMessage(
      error,
      "알 수 없는 directions 오류"
    );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
