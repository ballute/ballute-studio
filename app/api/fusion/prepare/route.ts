import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fileToBase64 } from "@/lib/utils";
import {
  analyzeBackgroundDNAFromBase64s,
  analyzePoseBlueprintFromBase64,
  searchLocationPrompts,
} from "@/lib/gemini-fusion";
import {
  ApiError,
  assertTempAssetOwnership,
  authenticateApiRequest,
  ensureUserHasPoints,
} from "@/lib/server-api";

const TEMP_INPUT_BUCKET = "temp-inputs";
const FUSION_COST_PER_IMAGE = 60;

function clampCount(value: unknown, fallback = 4) {
  const n = Number(value);
  return Math.max(1, Math.min(8, Number.isFinite(n) ? n : fallback));
}

function stripBucketPrefix(path: string) {
  if (!path) return path;
  const prefix = `${TEMP_INPUT_BUCKET}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64");
}

function getStorageAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase Storage 서버 설정이 없습니다. NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 확인하세요."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function storagePathToBase64(path: string) {
  const cleanedPath = stripBucketPrefix(path);

  if (!cleanedPath) {
    throw new Error("스토리지 경로가 비어 있습니다.");
  }

  const supabaseAdmin = getStorageAdmin();

  const { data, error } = await supabaseAdmin.storage
    .from(TEMP_INPUT_BUCKET)
    .download(cleanedPath);

  if (error || !data) {
    throw new Error(
      `스토리지 파일 읽기 실패: ${cleanedPath} / ${error?.message || "unknown"}`
    );
  }

  const buffer = await data.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

type JsonPrepareBody = {
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
    let bgBase64s: string[] = [];
    let poseBase64s: string[] = [];

    if (jsonBody) {
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

    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error ? error.message : "알 수 없는 FUSION 준비 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
