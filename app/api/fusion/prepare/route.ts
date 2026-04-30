import { NextResponse } from "next/server";
import { fileToBase64 } from "@/lib/utils";
import {
  analyzeBackgroundDNAFromBase64s,
  analyzeFaceBlueprintFromBase64,
  analyzePoseBlueprintFromBase64,
  searchLocationPrompts,
  type BackgroundDNA,
  type BackgroundMode,
  type FaceBlueprint,
  type PoseBlueprint,
} from "@/lib/gemini-fusion";
import {
  getCachedAnalysis,
  setCachedAnalysis,
  sha256,
} from "@/lib/blueprint-cache";
import {
  resizeBase64ForGenAI,
  resizeBase64sForGenAI,
} from "@/lib/image-resize";
import { gcsPathToBase64 } from "@/lib/gcs-storage";
import {
  ApiError,
  assertTempAssetOwnership,
  authenticateApiRequest,
  ensureGenerationSlotActive,
  ensureUserHasPoints,
} from "@/lib/server-api";
import {
  buildGenAiErrorLog,
  formatGenAiErrorMessage,
} from "@/lib/genai-response";
import { withPointNotChargedNotice } from "@/lib/genai-retry";

const FUSION_COST_PER_IMAGE = 60;
export const runtime = "nodejs";
export const maxDuration = 300;

function clampCount(value: unknown, fallback = 4) {
  const n = Number(value);
  return Math.max(1, Math.min(8, Number.isFinite(n) ? n : fallback));
}

function normalizeBackgroundMode(value: unknown): BackgroundMode {
  return value === "extract" ? "extract" : "creative";
}

const storagePathToBase64 = gcsPathToBase64;

type JsonPrepareBody = {
  batchId?: string;
  count?: number | string;
  backgroundMode?: BackgroundMode;
  bgPaths?: string[];
  posePaths?: string[];
  facePaths?: string[];
};

async function readJsonBody(req: Request): Promise<JsonPrepareBody | null> {
  const contentType = req.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return (await req.json()) as JsonPrepareBody;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const user = await authenticateApiRequest(req);
    await ensureUserHasPoints(user.id, FUSION_COST_PER_IMAGE);

    const jsonBody = await readJsonBody(req);

    let count = 4;
    let batchId = "";
    let backgroundMode: BackgroundMode = "creative";
    let bgBase64s: string[] = [];
    let poseBase64s: string[] = [];
    let facePaths: string[] = [];

    if (jsonBody) {
      batchId = (jsonBody.batchId || "").trim();
      count = clampCount(jsonBody.count, 4);
      backgroundMode = normalizeBackgroundMode(jsonBody.backgroundMode);

      const bgPaths = Array.isArray(jsonBody.bgPaths) ? jsonBody.bgPaths : [];
      const posePaths = Array.isArray(jsonBody.posePaths)
        ? jsonBody.posePaths
        : [];

      if (!bgPaths.length || !posePaths.length) {
        return NextResponse.json(
          { error: "BG 또는 POSE 스토리지 경로 누락." },
          { status: 400 }
        );
      }

      facePaths = Array.isArray(jsonBody.facePaths) ? jsonBody.facePaths : [];

      assertTempAssetOwnership(user.id, [...bgPaths, ...posePaths, ...facePaths]);

      bgBase64s = await Promise.all(bgPaths.map(storagePathToBase64));
      poseBase64s = await Promise.all(posePaths.map(storagePathToBase64));
    } else {
      const formData = await req.formData();

      batchId = ((formData.get("batchId") as string) || "").trim();
      count = clampCount(formData.get("count"), 4);
      backgroundMode = normalizeBackgroundMode(formData.get("backgroundMode"));

      const bgFiles = formData.getAll("bgs") as File[];
      const poseFiles = formData.getAll("poses") as File[];

      if (!bgFiles.length || !poseFiles.length) {
        return NextResponse.json(
          { error: "BG 또는 POSE 사진 누락." },
          { status: 400 }
        );
      }

      bgBase64s = await Promise.all(bgFiles.map(fileToBase64));
      poseBase64s = await Promise.all(poseFiles.map(fileToBase64));
    }

    // Gemini 전송용 리사이즈 (GCS 원본은 그대로). prepare는 분석 단계라 더 작게.
    bgBase64s = await resizeBase64sForGenAI(
      bgBase64s,
      backgroundMode === "extract" ? "bg-extract" : "bg-creative"
    );
    poseBase64s = await resizeBase64sForGenAI(poseBase64s, "pose");

    await ensureGenerationSlotActive(user.id, batchId, "fusion");

    // ─── bg DNA: 같은 bg 이미지 셋이면 캐시 재사용 ───
    const bgKey = `bg:${sha256(bgBase64s.join("|"))}:${backgroundMode}:v2`;
    let bgDNA = await getCachedAnalysis<BackgroundDNA>(bgKey);
    if (!bgDNA) {
      bgDNA = await analyzeBackgroundDNAFromBase64s(bgBase64s, backgroundMode);
      void setCachedAnalysis(bgKey, bgDNA);
    }

    // ─── location prompts: 같은 bgDNA + count + mode면 캐시 재사용 ───
    const locKey = `loc:${sha256(JSON.stringify(bgDNA))}:${count}:${backgroundMode}:v2`;
    let locationPrompts = await getCachedAnalysis<string[]>(locKey);
    if (!locationPrompts) {
      locationPrompts = await searchLocationPrompts(
        bgDNA,
        count,
        backgroundMode
      );
      void setCachedAnalysis(locKey, locationPrompts);
    }

    // ─── pose blueprints: 각 pose 이미지마다 캐시 재사용 ───
    const poseBlueprints: PoseBlueprint[] = [];
    for (const poseBase64 of poseBase64s) {
      const poseKey = `pose:${sha256(poseBase64)}:v2`;
      let blueprint = await getCachedAnalysis<PoseBlueprint>(poseKey);
      if (!blueprint) {
        blueprint = await analyzePoseBlueprintFromBase64(poseBase64);
        void setCachedAnalysis(poseKey, blueprint);
      }
      poseBlueprints.push(blueprint);
    }

    // ─── face blueprint: 같은 face 이미지면 캐시 재사용 ───
    let faceBlueprint: FaceBlueprint | undefined = undefined;
    if (facePaths.length > 0) {
      const rawFaceBase64 = await storagePathToBase64(facePaths[0]);
      const firstFaceBase64 = await resizeBase64ForGenAI(rawFaceBase64, "face");
      const faceKey = `face:${sha256(firstFaceBase64)}:v2`;
      const cachedFace = await getCachedAnalysis<FaceBlueprint>(faceKey);
      if (cachedFace) {
        faceBlueprint = cachedFace;
      } else {
        faceBlueprint = await analyzeFaceBlueprintFromBase64(firstFaceBase64);
        void setCachedAnalysis(faceKey, faceBlueprint);
      }
    }

    return NextResponse.json({
      success: true,
      backgroundMode,
      bgDNA,
      locationPrompts,
      poseBlueprints,
      faceBlueprint,
    });
  } catch (error) {
    console.error("FUSION_PREPARE_ERROR:", buildGenAiErrorLog(error));

    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = formatGenAiErrorMessage(
      error,
      "알 수 없는 FUSION 준비 오류"
    );

    return NextResponse.json(
      { error: withPointNotChargedNotice(message) },
      { status: 500 }
    );
  }
}
