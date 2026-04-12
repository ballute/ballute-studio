import { NextResponse } from "next/server";
import { fileToBase64 } from "@/lib/utils";
import {
  generateFusionImageWeb,
  BackgroundDNA,
  PoseBlueprint,
  LockedVibe,
  type BackgroundMode,
} from "@/lib/gemini-fusion";
import { gcsPathToBase64 } from "@/lib/gcs-storage";
import {
  ApiError,
  assertTempAssetOwnership,
  authenticateApiRequest,
  ensureGenerationSlotActive,
  ensureUserHasPoints,
  spendUserPoints,
} from "@/lib/server-api";
import {
  buildGenAiErrorLog,
  formatGenAiErrorMessage,
} from "@/lib/genai-response";
import { withPointNotChargedNotice } from "@/lib/genai-retry";

const FUSION_COST_PER_IMAGE = 60;
export const runtime = "nodejs";
export const maxDuration = 300;

const storagePathToBase64 = gcsPathToBase64;

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeBackgroundMode(value: unknown): BackgroundMode {
  return value === "extract" ? "extract" : "creative";
}

type JsonGenerateBody = {
  batchId?: string;
  fitSpec?: string;
  shootingMode?: string;
  customPrompt?: string;
  outfitMode?: string;
  backgroundMode?: BackgroundMode;
  mixCaptions?: string[];
  bgDNA?: BackgroundDNA;
  poseBlueprint?: PoseBlueprint;
  locationPrompt?: string;
  lockedVibe?: LockedVibe | null;
  facePaths?: string[];
  outfitPaths?: string[];
  bgPaths?: string[];
  posePath?: string;
  outputRatio?: "4:5" | "2:3" | "16:9"; // ✅ 추가
};

async function readJsonBody(req: Request): Promise<JsonGenerateBody | null> {
  const contentType = req.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return (await req.json()) as JsonGenerateBody;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const user = await authenticateApiRequest(req);
    await ensureUserHasPoints(user.id, FUSION_COST_PER_IMAGE);

    const jsonBody = await readJsonBody(req);

    let fitSpec = "";
    let shootingMode = "default";
    let customPrompt = "";
    let outfitMode = "outfit";
    let backgroundMode: BackgroundMode = "creative";
    let batchId = "";
    let mixCaptions: string[] = [];
    let bgDNA = {} as BackgroundDNA;
    let poseBlueprint = {} as PoseBlueprint;
    let locationPrompt = "";
    let lockedVibe: LockedVibe | null = null;
    let faceBase64s: string[] = [];
    let outfitBase64s: string[] = [];
    let backgroundBase64s: string[] = [];
    let outputRatio: "4:5" | "2:3" | "16:9" = "4:5"; // ✅ 추가

    if (jsonBody) {
      batchId = (jsonBody.batchId || "").trim();
      fitSpec = jsonBody.fitSpec || "";
      shootingMode = jsonBody.shootingMode || "default";
      customPrompt = jsonBody.customPrompt || "";
      outfitMode = jsonBody.outfitMode || "outfit";
      backgroundMode = normalizeBackgroundMode(jsonBody.backgroundMode);
      mixCaptions = Array.isArray(jsonBody.mixCaptions)
        ? jsonBody.mixCaptions
        : [];
      bgDNA = (jsonBody.bgDNA || {}) as BackgroundDNA;
      poseBlueprint = (jsonBody.poseBlueprint || {}) as PoseBlueprint;
      locationPrompt = (jsonBody.locationPrompt || "").trim();
      lockedVibe = (jsonBody.lockedVibe || null) as LockedVibe | null;

      outputRatio = jsonBody.outputRatio || "4:5"; // ✅ 추가

      const facePaths = Array.isArray(jsonBody.facePaths)
        ? jsonBody.facePaths
        : [];
      const outfitPaths = Array.isArray(jsonBody.outfitPaths)
        ? jsonBody.outfitPaths
        : [];
      const bgPaths = Array.isArray(jsonBody.bgPaths) ? jsonBody.bgPaths : [];
      const posePath = (jsonBody.posePath || "").trim();

      if (!facePaths.length) {
        return NextResponse.json(
          { error: "얼굴 스토리지 경로는 최소 1개 필요하다." },
          { status: 400 }
        );
      }

      if (!outfitPaths.length) {
        return NextResponse.json(
          { error: "의상 스토리지 경로는 최소 1개 필요하다." },
          { status: 400 }
        );
      }

      if (!locationPrompt) {
        return NextResponse.json(
          { error: "로케이션 프롬프트가 필요하다." },
          { status: 400 }
        );
      }

      if (!posePath) {
        return NextResponse.json(
          { error: "포즈 스토리지 경로가 필요하다." },
          { status: 400 }
        );
      }

      assertTempAssetOwnership(user.id, [
        ...facePaths,
        ...outfitPaths,
        ...bgPaths,
        posePath,
      ]);

      faceBase64s = await Promise.all(facePaths.map(storagePathToBase64));
      outfitBase64s = await Promise.all(outfitPaths.map(storagePathToBase64));
      backgroundBase64s =
        backgroundMode === "extract"
          ? await Promise.all(bgPaths.map(storagePathToBase64))
          : [];
    } else {
      const formData = await req.formData();

      batchId = ((formData.get("batchId") as string) || "").trim();
      fitSpec = (formData.get("fitSpec") as string) || "";
      shootingMode = (formData.get("shootingMode") as string) || "default";
      customPrompt = (formData.get("customPrompt") as string) || "";
      outfitMode = (formData.get("outfitMode") as string) || "outfit";
      backgroundMode = normalizeBackgroundMode(formData.get("backgroundMode"));
      const mixCaptionsRaw = (formData.get("mixCaptions") as string) || "[]";
      const bgDNARaw = (formData.get("bgDNA") as string) || "{}";
      const poseBlueprintRaw = (formData.get("poseBlueprint") as string) || "{}";
      locationPrompt = ((formData.get("locationPrompt") as string) || "").trim();
      const lockedVibeRaw = (formData.get("lockedVibe") as string) || "";
      const outputRatioRaw =
        (formData.get("outputRatio") as string) || "4:5"; // ✅ 추가

      outputRatio = outputRatioRaw as "4:5" | "2:3" | "16:9"; // ✅ 추가

      const faceFiles = formData.getAll("faces") as File[];
      const outfitFiles = formData.getAll("outfits") as File[];
      const bgFiles = formData.getAll("bgs") as File[];

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

      if (!locationPrompt) {
        return NextResponse.json(
          { error: "로케이션 프롬프트가 필요하다." },
          { status: 400 }
        );
      }

      faceBase64s = await Promise.all(faceFiles.map(fileToBase64));
      outfitBase64s = await Promise.all(outfitFiles.map(fileToBase64));
      backgroundBase64s =
        backgroundMode === "extract"
          ? await Promise.all(bgFiles.map(fileToBase64))
          : [];

      mixCaptions = safeJsonParse<string[]>(mixCaptionsRaw, []);
      bgDNA = safeJsonParse<BackgroundDNA>(bgDNARaw, {} as BackgroundDNA);
      poseBlueprint = safeJsonParse<PoseBlueprint>(
        poseBlueprintRaw,
        {} as PoseBlueprint
      );
      lockedVibe = lockedVibeRaw
        ? safeJsonParse<LockedVibe | null>(lockedVibeRaw, null)
        : null;
    }

    await ensureGenerationSlotActive(user.id, batchId, "fusion");

    const generationStartedAt = Date.now();

    const generated = await generateFusionImageWeb({
      faceBase64s,
      outfitBase64s,
      backgroundBase64s,
      poseBlueprint,
      targetLocationText: locationPrompt,
      bgDNA,
      backgroundMode,
      bodySpecs: fitSpec,
      isMixMode: outfitMode === "mix",
      mixCaptions,
      lockedVibe,
      shootingMode,
      customPrompt: shootingMode === "custom" ? customPrompt : undefined,
      outputRatio, // ✅ 핵심 추가
    });

    const elapsedMs = Date.now() - generationStartedAt;

    await spendUserPoints(user.id, FUSION_COST_PER_IMAGE, "FUSION GENERATE");

    return NextResponse.json({
      success: true,
      chargedPoints: FUSION_COST_PER_IMAGE,
      result: {
        image: generated.base64,
        summary: generated.summary,
        elapsedMs,
        backgroundMode,
        locationPrompt,
        poseBlueprint,
        bgDNA,
      },
    });
  } catch (error) {
    console.error("FUSION_GENERATE_ONE_ERROR:", buildGenAiErrorLog(error));

    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = formatGenAiErrorMessage(
      error,
      "알 수 없는 FUSION 생성 오류"
    );

    return NextResponse.json(
      { error: withPointNotChargedNotice(message) },
      { status: 500 }
    );
  }
}
