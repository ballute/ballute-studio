import { NextResponse } from "next/server";
import { fileToBase64 } from "@/lib/utils";
import {
  analyzeBackgroundDNAFromBase64s,
  analyzePoseBlueprintFromBase64,
  searchLocationPrompts,
} from "@/lib/gemini-fusion";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const countRaw = (formData.get("count") as string) || "4";
    const count = Math.max(1, Math.min(8, Number(countRaw) || 4));

    const bgFiles = formData.getAll("bgs") as File[];
    const poseFiles = formData.getAll("poses") as File[];

    if (!bgFiles.length || !poseFiles.length) {
      return NextResponse.json(
        { error: "BG 또는 POSE 사진 누락." },
        { status: 400 }
      );
    }

    const bgBase64s = await Promise.all(bgFiles.map(fileToBase64));
    const poseBase64s = await Promise.all(poseFiles.map(fileToBase64));

    const bgDNA = await analyzeBackgroundDNAFromBase64s(bgBase64s);
    const locationPrompts = await searchLocationPrompts(bgDNA, count);

    const poseBlueprints = [];
    for (const poseBase64 of poseBase64s) {
      const blueprint = await analyzePoseBlueprintFromBase64(poseBase64);
      poseBlueprints.push(blueprint);
    }

    return NextResponse.json({
      success: true,
      bgDNA,
      locationPrompts,
      poseBlueprints,
    });
  } catch (error) {
    console.error("FUSION_PREPARE_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "알 수 없는 FUSION 준비 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}