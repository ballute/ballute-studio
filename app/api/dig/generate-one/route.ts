import { NextResponse } from "next/server";
import { fileToBase64 } from "@/lib/utils";
import {
  generateDigImageWeb,
  LockedVibe,
  DigDirection,
} from "@/lib/gemini-dig";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const fitSpec = (formData.get("fitSpec") as string) || "";
    const shootingMode = (formData.get("shootingMode") as string) || "default";
    const customPrompt = (formData.get("customPrompt") as string) || "";
    const outfitMode = (formData.get("outfitMode") as string) || "outfit";
    const lockedVibeRaw = (formData.get("lockedVibe") as string) || "";
    const directionRaw = (formData.get("direction") as string) || "";
    const mixCaptionsRaw = (formData.get("mixCaptions") as string) || "[]";

    const faceFiles = formData.getAll("faces") as File[];
    const outfitFiles = formData.getAll("outfits") as File[];

    if (!directionRaw) {
      return NextResponse.json(
        { error: "direction 정보가 필요하다." },
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

    const direction = JSON.parse(directionRaw) as DigDirection;
    const mixCaptions = JSON.parse(mixCaptionsRaw) as string[];
    const lockedVibe: LockedVibe | null = lockedVibeRaw
      ? JSON.parse(lockedVibeRaw)
      : null;

    if (outfitMode === "mix" && mixCaptions.length !== outfitFiles.length) {
      return NextResponse.json(
        { error: "MIX 설명 수와 의상 이미지 수가 맞지 않는다." },
        { status: 400 }
      );
    }

    const faceBase64s = await Promise.all(faceFiles.map(fileToBase64));
    const outfitBase64s = await Promise.all(outfitFiles.map(fileToBase64));

    const generated = await generateDigImageWeb({
      faceBase64s,
      outfitBase64s,
      dirSet: direction,
      bodySpecs: fitSpec,
      shootingMode,
      customPrompt: shootingMode === "custom" ? customPrompt : undefined,
      lockedVibe,
      isMixMode: outfitMode === "mix",
      mixCaptions,
    });

    return NextResponse.json({
      success: true,
      result: {
        image: generated.base64,
        summary: generated.summary,
        direction,
      },
    });
  } catch (error) {
    console.error("DIG_GENERATE_ONE_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "알 수 없는 generate-one 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}