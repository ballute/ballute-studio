import { NextResponse } from "next/server";
import {
  ApiError,
  authenticateApiRequest,
  releaseGenerationSlot,
} from "@/lib/server-api";

type JsonBody = {
  batchId?: string;
};

export async function POST(req: Request) {
  try {
    const user = await authenticateApiRequest(req);
    const body = (await req.json()) as JsonBody;
    const batchId = (body.batchId || "").trim();

    await releaseGenerationSlot(user.id, batchId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("GENERATION_SLOT_RELEASE_ERROR:", error);

    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error ? error.message : "실행 슬롯 해제 중 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
