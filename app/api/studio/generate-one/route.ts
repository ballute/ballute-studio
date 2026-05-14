import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/server-api";
import { gcsPathToBase64 } from "@/lib/gcs-storage";
import {
  generateStudioShotWeb,
  type Gender,
  type OutfitTag,
  type OutputRatio,
  type StudioShot,
} from "@/lib/gemini-studio";
import {
  buildGenAiErrorLog,
  formatGenAiErrorMessage,
} from "@/lib/genai-response";

export const runtime = "nodejs";
export const maxDuration = 300;

// 모델 anchor 사진은 GCS_BUCKET_NAME/studio-models/ 에 영구 보관.
// 라이프사이클 자동삭제 룰은 제거됨. 임시 파일은 cleanup cron이 timestamp 패턴으로만 청소.
const MODEL_REF_PATH: Record<Gender, Record<StudioShot, string>> = {
  male: {
    front:     "studio-models/male.jpg",
    "45deg":   "studio-models/male.jpg",
    back:      "studio-models/male-back.jpg",
    freepose:  "studio-models/male.jpg",
    upperbody: "studio-models/male.jpg",
    lowerbody: "studio-models/male.jpg",
  },
  female: {
    front:     "studio-models/female.jpg",
    "45deg":   "studio-models/female.jpg",
    back:      "studio-models/female.jpg",
    freepose:  "studio-models/female.jpg",
    upperbody: "studio-models/female.jpg",
    lowerbody: "studio-models/female.jpg",
  },
};

export async function POST(req: Request) {
  try {
    await authenticateApiRequest(req);

    const formData = await req.formData();
    const outfitFiles = formData.getAll("outfit") as File[];
    const outfitTags = formData.getAll("outfitTag").map((v) => String(v) as OutfitTag);
    const sourceSpecs = String(formData.get("sourceSpecs") || "").trim();
    const gender = (formData.get("gender") || "male") as Gender;
    const shot = (formData.get("shot") || "front") as StudioShot;
    const label = String(formData.get("label") || "").trim();
    const aspectRatioRaw = String(formData.get("aspectRatio") || "").trim();
    const aspectRatio = aspectRatioRaw ? (aspectRatioRaw as OutputRatio) : undefined;
    const poseRefFile = formData.get("poseRef") as File | null;
    const detailFreepose = String(formData.get("detailFreepose") || "") === "1";

    if (!outfitFiles.length) {
      return NextResponse.json({ error: "착샷 이미지가 필요합니다." }, { status: 400 });
    }

    const outfitBase64s = await Promise.all(
      outfitFiles.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        return Buffer.from(arrayBuffer).toString("base64");
      })
    );
    const modelBase64 = await gcsPathToBase64(MODEL_REF_PATH[gender][shot]);

    const poseRefBase64 =
      shot === "freepose" && poseRefFile
        ? Buffer.from(await poseRefFile.arrayBuffer()).toString("base64")
        : undefined;

    const { base64 } = await generateStudioShotWeb({
      modelBase64,
      outfitBase64s,
      outfitTags,
      shot,
      gender,
      sourceSpecs: sourceSpecs || undefined,
      label: label || undefined,
      poseRefBase64,
      aspectRatio,
      detailFreepose,
    });

    return NextResponse.json({
      shot,
      url: `data:image/png;base64,${base64}`,
    });
  } catch (error) {
    console.error("STUDIO_GENERATE_ONE_ERROR:", buildGenAiErrorLog(error));
    const message = formatGenAiErrorMessage(error, "생성 중 오류가 발생했습니다.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
