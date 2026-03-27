import { NextResponse } from "next/server";
import { fileToBase64 } from "@/lib/utils";
import {
  analyzeReferenceWeb,
  generateRefRunImageWeb,
} from "@/lib/gemini-refrun";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const fitSpec = (formData.get("fitSpec") as string) || "";
    const shootingMode = (formData.get("shootingMode") as string) || "default";
    const customPrompt = (formData.get("customPrompt") as string) || "";

    const faceFiles = formData.getAll("faces") as File[];
    const outfitFiles = formData.getAll("outfits") as File[];
    const referenceFile = formData.get("reference") as File | null;

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

    if (!referenceFile) {
      return NextResponse.json(
        { error: "레퍼런스 이미지는 최소 1장 필요하다." },
        { status: 400 }
      );
    }

    const faceBase64s = await Promise.all(faceFiles.map(fileToBase64));
    const outfitBase64s = await Promise.all(outfitFiles.map(fileToBase64));
    const referenceBase64 = await fileToBase64(referenceFile);

    const analyzed = await analyzeReferenceWeb(referenceBase64);

    const generated = await generateRefRunImageWeb({
      faceBase64s,
      outfitBase64s,
      dirSet: analyzed,
      bodySpecs: fitSpec,
      shootingMode,
      customPrompt: shootingMode === "custom" ? customPrompt : undefined,
    });

    return NextResponse.json({
      success: true,
      result: {
        image: generated.base64,
        summary: generated.summary,
        direction: analyzed,
      },
    });
  } catch (error) {
    console.error("REFRUN_RUN_ONE_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "알 수 없는 REFRUN 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}