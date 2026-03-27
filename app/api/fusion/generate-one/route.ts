import { NextResponse } from "next/server";
import { fileToBase64 } from "@/lib/utils";
import {
  generateFusionImageWeb,
  BackgroundDNA,
  PoseBlueprint,
  LockedVibe,
} from "@/lib/gemini-fusion";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const fitSpec = (formData.get("fitSpec") as string) || "";
    const shootingMode = (formData.get("shootingMode") as string) || "default";
    const customPrompt = (formData.get("customPrompt") as string) || "";
    const outfitMode = (formData.get("outfitMode") as string) || "outfit";
    const mixCaptionsRaw = (formData.get("mixCaptions") as string) || "[]";
    const bgDNARaw = (formData.get("bgDNA") as string) || "{}";
    const poseBlueprintRaw = (formData.get("poseBlueprint") as string) || "{}";
    const locationPrompt = (formData.get("locationPrompt") as string) || "";
    const lockedVibeRaw = (formData.get("lockedVibe") as string) || "";

    const faceFiles = formData.getAll("faces") as File[];
    const outfitFiles = formData.getAll("outfits") as File[];

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

    if (!locationPrompt.trim()) {
      return NextResponse.json(
        { error: "로케이션 프롬프트가 필요하다." },
        { status: 400 }
      );
    }

    const faceBase64s = await Promise.all(faceFiles.map(fileToBase64));
    const outfitBase64s = await Promise.all(outfitFiles.map(fileToBase64));

    const mixCaptions = JSON.parse(mixCaptionsRaw) as string[];
    const bgDNA = JSON.parse(bgDNARaw) as BackgroundDNA;
    const poseBlueprint = JSON.parse(poseBlueprintRaw) as PoseBlueprint;
    const lockedVibe: LockedVibe | null = lockedVibeRaw
      ? JSON.parse(lockedVibeRaw)
      : null;

    const generated = await generateFusionImageWeb({
      faceBase64s,
      outfitBase64s,
      poseBlueprint,
      targetLocationText: locationPrompt,
      bgDNA,
      bodySpecs: fitSpec,
      isMixMode: outfitMode === "mix",
      mixCaptions,
      lockedVibe,
      shootingMode,
      customPrompt: shootingMode === "custom" ? customPrompt : undefined,
    });

    return NextResponse.json({
      success: true,
      result: {
        image: generated.base64,
        summary: generated.summary,
        locationPrompt,
        poseBlueprint,
        bgDNA,
      },
    });
  } catch (error) {
    console.error("FUSION_GENERATE_ONE_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "알 수 없는 FUSION 생성 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}