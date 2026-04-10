import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fileToBase64 } from "@/lib/utils";
import {
  analyzeReferenceWeb,
  generateRefRunImageWeb,
} from "@/lib/gemini-refrun";
import {
  ApiError,
  assertTempAssetOwnership,
  authenticateApiRequest,
  ensureGenerationSlotActive,
  ensureUserHasPoints,
  spendUserPoints,
} from "@/lib/server-api";

const TEMP_INPUT_BUCKET = "temp-inputs";
const REFRUN_COST_PER_IMAGE = 50;

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

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type JsonRefRunBody = {
  batchId?: string;
  fitSpec?: string;
  shootingMode?: string;
  customPrompt?: string;
  outfitMode?: string;
  mixCaptions?: string[];
  facePaths?: string[];
  outfitPaths?: string[];
  referencePath?: string;
  outputRatio?: "4:5" | "2:3" | "16:9"; // ✅ 추가
};

async function readJsonBody(req: Request): Promise<JsonRefRunBody | null> {
  const contentType = req.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return (await req.json()) as JsonRefRunBody;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const user = await authenticateApiRequest(req);
    await ensureUserHasPoints(user.id, REFRUN_COST_PER_IMAGE);

    const jsonBody = await readJsonBody(req);

    let fitSpec = "";
    let shootingMode = "default";
    let customPrompt = "";
    let outfitMode = "outfit";
    let batchId = "";
    let mixCaptions: string[] = [];

    let faceBase64s: string[] = [];
    let outfitBase64s: string[] = [];
    let referenceBase64 = "";
    let outputRatio: "4:5" | "2:3" | "16:9" = "4:5"; // ✅ 추가

    if (jsonBody) {
      batchId = (jsonBody.batchId || "").trim();
      fitSpec = jsonBody.fitSpec || "";
      shootingMode = jsonBody.shootingMode || "default";
      customPrompt = jsonBody.customPrompt || "";
      outfitMode = jsonBody.outfitMode || "outfit";
      mixCaptions = Array.isArray(jsonBody.mixCaptions)
        ? jsonBody.mixCaptions
        : [];

      outputRatio = jsonBody.outputRatio || "4:5"; // ✅ 추가

      const facePaths = Array.isArray(jsonBody.facePaths)
        ? jsonBody.facePaths
        : [];
      const outfitPaths = Array.isArray(jsonBody.outfitPaths)
        ? jsonBody.outfitPaths
        : [];
      const referencePath = (jsonBody.referencePath || "").trim();

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

      if (!referencePath) {
        return NextResponse.json(
          { error: "레퍼런스 스토리지 경로는 최소 1개 필요하다." },
          { status: 400 }
        );
      }

      if (outfitMode === "mix" && mixCaptions.length !== outfitPaths.length) {
        return NextResponse.json(
          { error: "MIX 설명 수와 의상 이미지 수가 맞지 않는다." },
          { status: 400 }
        );
      }

      assertTempAssetOwnership(user.id, [
        ...facePaths,
        ...outfitPaths,
        referencePath,
      ]);

      faceBase64s = await Promise.all(facePaths.map(storagePathToBase64));
      outfitBase64s = await Promise.all(outfitPaths.map(storagePathToBase64));
      referenceBase64 = await storagePathToBase64(referencePath);
    } else {
      const formData = await req.formData();

      batchId = ((formData.get("batchId") as string) || "").trim();
      fitSpec = (formData.get("fitSpec") as string) || "";
      shootingMode = (formData.get("shootingMode") as string) || "default";
      customPrompt = (formData.get("customPrompt") as string) || "";
      outfitMode = (formData.get("outfitMode") as string) || "outfit";
      const mixCaptionsRaw = (formData.get("mixCaptions") as string) || "[]";
      const outputRatioRaw =
        (formData.get("outputRatio") as string) || "4:5"; // ✅ 추가

      outputRatio = outputRatioRaw as "4:5" | "2:3" | "16:9"; // ✅ 추가

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

      mixCaptions = safeJsonParse<string[]>(mixCaptionsRaw, []);

      if (outfitMode === "mix" && mixCaptions.length !== outfitFiles.length) {
        return NextResponse.json(
          { error: "MIX 설명 수와 의상 이미지 수가 맞지 않는다." },
          { status: 400 }
        );
      }

      faceBase64s = await Promise.all(faceFiles.map(fileToBase64));
      outfitBase64s = await Promise.all(outfitFiles.map(fileToBase64));
      referenceBase64 = await fileToBase64(referenceFile);
    }

    await ensureGenerationSlotActive(user.id, batchId, "refrun");

    const analyzed = await analyzeReferenceWeb(referenceBase64);

    const generationStartedAt = Date.now();

    const generated = await generateRefRunImageWeb({
      faceBase64s,
      outfitBase64s,
      dirSet: analyzed,
      bodySpecs: fitSpec,
      shootingMode,
      customPrompt: shootingMode === "custom" ? customPrompt : undefined,
      isMixMode: outfitMode === "mix",
      mixCaptions,
      outputRatio, // ✅ 핵심 추가
    });

    const elapsedMs = Date.now() - generationStartedAt;

    await spendUserPoints(user.id, REFRUN_COST_PER_IMAGE, "REFRUN GENERATE");

    return NextResponse.json({
      success: true,
      chargedPoints: REFRUN_COST_PER_IMAGE,
      result: {
        image: generated.base64,
        summary: generated.summary,
        elapsedMs,
        direction: analyzed,
      },
    });
  } catch (error) {
    console.error("REFRUN_RUN_ONE_ERROR:", error);

    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error ? error.message : "알 수 없는 REFRUN 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
