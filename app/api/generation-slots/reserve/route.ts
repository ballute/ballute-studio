import { NextResponse } from "next/server";
import {
  ApiError,
  authenticateApiRequest,
  reserveGenerationSlot,
  type GenerationMode,
} from "@/lib/server-api";

type JsonBody = {
  batchId?: string;
  mode?: GenerationMode;
};

export async function POST(req: Request) {
  try {
    const user = await authenticateApiRequest(req);
    const body = (await req.json()) as JsonBody;
    const batchId = (body.batchId || "").trim();
    const mode = body.mode;

    if (mode !== "dig" && mode !== "fusion" && mode !== "refrun") {
      return NextResponse.json({ error: "mode가 올바르지 않습니다." }, { status: 400 });
    }

    const result = await reserveGenerationSlot(user.id, batchId, mode);

    return NextResponse.json({
      success: true,
      status: result.status || "queued",
      queuePosition: result.queue_position ?? 1,
      activeCount: result.active_count ?? 0,
      maxActive: result.max_active ?? 0,
      message:
        result.status === "active"
          ? "작업이 시작되었습니다."
          : result.message || "대기열에 등록되었습니다.",
    });
  } catch (error) {
    console.error("GENERATION_SLOT_RESERVE_ERROR:", error);

    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error ? error.message : "대기열 등록 중 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
