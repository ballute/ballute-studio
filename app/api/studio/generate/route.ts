import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/server-api";
import { gcsPathToBase64 } from "@/lib/gcs-storage";
import {
  generateStudioShotWeb,
  type Gender,
  type StudioShot,
} from "@/lib/gemini-studio";

// 모델 anchor는 GCS_BUCKET_NAME/studio-models/ 에 영구 보관 (라이프사이클 룰 제거됨).
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

export const runtime = "nodejs";
export const maxDuration = 300;

const ALL_SHOTS: StudioShot[] = ["front", "45deg", "back", "freepose", "upperbody", "lowerbody"];

export async function POST(req: Request) {
  try {
    await authenticateApiRequest(req);

    const formData = await req.formData();
    const outfitFile = formData.get("outfit") as File | null;
    const sourceSpecs = String(formData.get("sourceSpecs") || "").trim();
    const gender = (formData.get("gender") || "male") as Gender;
    const shotsRaw = String(formData.get("shots") || "").trim();
    const requestedShots: StudioShot[] = shotsRaw
      ? (JSON.parse(shotsRaw) as StudioShot[])
      : ALL_SHOTS;

    if (!outfitFile) {
      return NextResponse.json(
        { error: "착샷 이미지가 필요합니다." },
        { status: 400 }
      );
    }

    const arrayBuffer = await outfitFile.arrayBuffer();
    const outfitBase64 = Buffer.from(arrayBuffer).toString("base64");

    // 같은 anchor 중복 fetch 방지 캐시
    const refCache = new Map<string, string>();
    const getModelRef = async (g: Gender, s: StudioShot) => {
      const key = MODEL_REF_PATH[g][s];
      if (!refCache.has(key)) {
        refCache.set(key, await gcsPathToBase64(key));
      }
      return refCache.get(key)!;
    };

    const images: { shot: StudioShot; url: string | null }[] = [];

    for (const shot of requestedShots) {
      try {
        const modelBase64 = await getModelRef(gender, shot);
        const { base64 } = await generateStudioShotWeb({
          modelBase64,
          outfitBase64s: [outfitBase64],
          shot,
          gender,
          sourceSpecs: sourceSpecs || undefined,
        });

        images.push({ shot, url: `data:image/png;base64,${base64}` });
      } catch (err) {
        console.error(`STUDIO_SHOT_ERROR [${shot}]:`, err);
        images.push({ shot, url: null });
      }
    }

    return NextResponse.json({ images });
  } catch (error) {
    console.error("STUDIO_GENERATE_ERROR:", error);
    const message =
      error instanceof Error ? error.message : "생성 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
