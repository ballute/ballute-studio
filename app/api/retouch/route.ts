import { NextResponse } from "next/server";
import {
  retouchGeneral,
  retouchGarment,
  retouchExpression,
  retouchMood,
  type RetouchType,
  type GarmentType,
} from "@/lib/gemini-retouch";
import {
  ApiError,
  authenticateApiRequest,
  ensureUserHasPoints,
  spendUserPoints,
} from "@/lib/server-api";
import {
  buildGenAiErrorLog,
  formatGenAiErrorMessage,
} from "@/lib/genai-response";
import { withPointNotChargedNotice } from "@/lib/genai-retry";

const RETOUCH_COST = 30;
export const runtime = "nodejs";
export const maxDuration = 300;

type RetouchBody = {
  type: RetouchType;
  imageBase64: string;
  instruction?: string;
  intensity?: number;
  garmentBase64?: string;
  garmentType?: GarmentType;
  moodDescription?: string;
  moodReferenceBase64?: string;
  styleReferenceBase64?: string;
  textureLevel?: number;
};

export async function POST(req: Request) {
  try {
    const user = await authenticateApiRequest(req);
    await ensureUserHasPoints(user.id, RETOUCH_COST);

    const body = (await req.json()) as RetouchBody;
    const { type, imageBase64, instruction, intensity, garmentBase64, garmentType, moodDescription, moodReferenceBase64, styleReferenceBase64, textureLevel } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: "이미지가 필요하다." }, { status: 400 });
    }

    let resultImage: string;

    if (type === "general") {
      if (!instruction && !styleReferenceBase64) {
        return NextResponse.json({ error: "수정 지시 또는 스타일 레퍼런스 이미지가 필요하다." }, { status: 400 });
      }
      resultImage = await retouchGeneral(imageBase64, instruction ?? "", intensity ?? 50, styleReferenceBase64);
    } else if (type === "garment") {
      if (!garmentType) {
        return NextResponse.json({ error: "garmentType(top/bottom)이 필요하다." }, { status: 400 });
      }
      if (!instruction && !garmentBase64) {
        return NextResponse.json({ error: "의상 지시 또는 이미지가 필요하다." }, { status: 400 });
      }
      resultImage = await retouchGarment(
        imageBase64,
        garmentType,
        instruction ?? "",
        garmentBase64
      );
    } else if (type === "expression") {
      if (!instruction) {
        return NextResponse.json({ error: "표정 지시가 필요하다." }, { status: 400 });
      }
      resultImage = await retouchExpression(imageBase64, instruction);
    } else if (type === "mood") {
      if (!moodDescription && !moodReferenceBase64 && (textureLevel === undefined || textureLevel === 0)) {
        return NextResponse.json({ error: "무드 설명, 레퍼런스 이미지, 또는 텍스처 조절이 필요하다." }, { status: 400 });
      }
      resultImage = await retouchMood(imageBase64, moodDescription ?? "", moodReferenceBase64, textureLevel ?? 0);
    } else {
      return NextResponse.json({ error: "유효하지 않은 type이다." }, { status: 400 });
    }

    await spendUserPoints(user.id, RETOUCH_COST, "RETOUCH");

    return NextResponse.json({
      success: true,
      chargedPoints: RETOUCH_COST,
      result: { image: resultImage },
    });
  } catch (error) {
    console.error("RETOUCH_ERROR:", buildGenAiErrorLog(error));

    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = formatGenAiErrorMessage(error, "알 수 없는 리터치 오류");
    return NextResponse.json(
      { error: withPointNotChargedNotice(message) },
      { status: 500 }
    );
  }
}
