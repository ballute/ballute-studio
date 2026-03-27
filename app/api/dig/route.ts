import { NextResponse } from "next/server";
import { fileToBase64 } from "@/lib/utils";
import {
  generateCreativeDirectionsWeb,
  generateDigImageWeb,
  LockedVibe,
} from "@/lib/gemini-dig";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const moodQuery = (formData.get("moodQuery") as string) || "";
    const bodySpecs = (formData.get("fitSpec") as string) || "";
    const shootingMode = (formData.get("shootingMode") as string) || "default";
    const customPrompt = (formData.get("customPrompt") as string) || "";
    const outfitMode = (formData.get("outfitMode") as string) || "outfit";
    const countRaw = (formData.get("count") as string) || "4";
    const lockedVibeRaw = (formData.get("lockedVibe") as string) || "";

    const count = Math.max(1, Math.min(8, Number(countRaw) || 4));

    const faceFiles = formData.getAll("faces") as File[];
    const outfitFiles = formData.getAll("outfits") as File[];
    const mixCaptionsRaw = (formData.get("mixCaptions") as string) || "[]";

    const mixCaptions = JSON.parse(mixCaptionsRaw) as string[];
    const lockedVibe: LockedVibe | null = lockedVibeRaw
      ? JSON.parse(lockedVibeRaw)
      : null;

    if (!moodQuery.trim()) {
      return NextResponse.json(
        { error: "무드 키워드가 필요하다." },
        { status: 400 }
      );
    }

    if (!faceFiles.length) {
      return NextResponse.json(
        { error: "얼굴 이미지는 최소 1장 필요하다." },
        { status: 400 }
      );
    }

    if (!outfitFiles.length) {
      return NextResponse.json(
        { error: "의상 이미지는 최소 1장 필요하다." },
        { status: 400 }
      );
    }

    if (outfitMode === "mix" && mixCaptions.length !== outfitFiles.length) {
      return NextResponse.json(
        { error: "MIX 설명 수와 의상 이미지 수가 맞지 않는다." },
        { status: 400 }
      );
    }

    const faceBase64s = await Promise.all(faceFiles.map(fileToBase64));
    const outfitBase64s = await Promise.all(outfitFiles.map(fileToBase64));

    const directions = await generateCreativeDirectionsWeb(moodQuery, count);

    const results = [];
    for (const dirSet of directions) {
      const generated = await generateDigImageWeb({
        faceBase64s,
        outfitBase64s,
        dirSet,
        bodySpecs,
        shootingMode,
        customPrompt: shootingMode === "custom" ? customPrompt : undefined,
        lockedVibe,
        isMixMode: outfitMode === "mix",
        mixCaptions,
      });

      results.push({
        image: generated.base64,
        summary: generated.summary,
        direction: dirSet,
      });
    }

    return NextResponse.json({
      success: true,
      directions,
      results,
    });
  } catch (error) {
    console.error("DIG_ROUTE_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "알 수 없는 DIG 서버 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}