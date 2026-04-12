import { NextRequest, NextResponse } from "next/server";
import {
  authenticateApiRequest,
  releaseGenerationSlot,
} from "@/lib/server-api";
import { deleteGcsPrefix } from "@/lib/gcs-storage";

export const runtime = "nodejs";

type DeleteBody = {
  sessionId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateApiRequest(req);
    const body = (await req.json()) as DeleteBody;
    const sessionId = (body.sessionId || "").trim();

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId가 필요합니다." },
        { status: 400 }
      );
    }

    const targetPrefix = `${user.id}/${sessionId}`;
    const removedPaths = await deleteGcsPrefix(targetPrefix);

    await releaseGenerationSlot(user.id, sessionId);

    return NextResponse.json({
      success: true,
      removed: removedPaths.length,
      removedPaths,
    });
  } catch (error) {
    console.error("TEMP_ASSETS_DELETE_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "알 수 없는 temp 삭제 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
