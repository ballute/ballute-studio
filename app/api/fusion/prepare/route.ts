import { NextResponse } from "next/server";
import { fileToBase64 } from "@/lib/utils";
import {
  analyzeBackgroundDNAFromBase64s,
  analyzePoseBlueprintFromBase64,
  searchLocationPrompts,
} from "@/lib/gemini-fusion";
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

const FUSION_COST_PER_IMAGE = 60;
export const runtime = "nodejs";
export const maxDuration = 300;

function clampCount(value: unknown, fallback = 4) {
  const n = Number(value);
  return Math.max(1, Math.min(8, Number.isFinite(n) ? n : fallback));
}

const storagePathToBase64 = gcsPathToBase64;

type JsonPrepareBody = {
  batchId?: string;
  count?: number | string;
  bgPaths?: string[];
  posePaths?: string[];
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
    let bgBase64s: string[] = [];
    let poseBase64s: string[] = [];

    if (jsonBody) {
      batchId = (jsonBody.batchId || "").trim();
      count = clampCount(jsonBody.count, 4);

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

      assertTempAssetOwnership(user.id, [...bgPaths, ...posePaths]);

      bgBase64s = await Promise.all(bgPaths.map(storagePathToBase64));
      poseBase64s = await Promise.all(posePaths.map(storagePathToBase64));
    } else {
      const formData = await req.formData();

      batchId = ((formData.get("batchId") as string) || "").trim();
      count = clampCount(formData.get("count"), 4);

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

    await ensureGenerationSlotActive(user.id, batchId, "fusion");

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
    console.error("FUSION_PREPARE_ERROR:", buildGenAiErrorLog(error));

    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = formatGenAiErrorMessage(
      error,
      "알 수 없는 FUSION 준비 오류"
    );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
