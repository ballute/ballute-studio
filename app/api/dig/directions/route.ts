import { NextResponse } from "next/server";
import { generateCreativeDirectionsWeb } from "@/lib/gemini-dig";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const moodQuery = (formData.get("moodQuery") as string) || "";
    const countRaw = (formData.get("count") as string) || "4";
    const count = Math.max(1, Math.min(8, Number(countRaw) || 4));

    if (!moodQuery.trim()) {
      return NextResponse.json(
        { error: "무드 키워드가 필요하다." },
        { status: 400 }
      );
    }

    const directions = await generateCreativeDirectionsWeb(moodQuery, count);

    return NextResponse.json({
      success: true,
      directions,
    });
  } catch (error) {
    console.error("DIG_DIRECTIONS_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "알 수 없는 directions 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}