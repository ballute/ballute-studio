import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fileToBase64 } from "@/lib/utils";
import {
  generateFusionImageWeb,
  BackgroundDNA,
  PoseBlueprint,
  LockedVibe,
} from "@/lib/gemini-fusion";

const TEMP_INPUT_BUCKET = "temp-inputs";

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

type JsonGenerateBody = {
  fitSpec?: string;
  shootingMode?: string;
  customPrompt?: string;
  outfitMode?: string;
  mixCaptions?: string[];
  bgDNA?: BackgroundDNA;
  poseBlueprint?: PoseBlueprint;
  locationPrompt?: string;
  lockedVibe?: LockedVibe | null;
  facePaths?: string[];
  outfitPaths?: string[];
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
    const jsonBody = await readJsonBody(req);

    let fitSpec = "";
    let shootingMode = "default";
    let customPrompt = "";
    let outfitMode = "outfit";
    let mixCaptions: string[] = [];
    let bgDNA = {} as BackgroundDNA;
    let poseBlueprint = {} as PoseBlueprint;
    let locationPrompt = "";
    let lockedVibe: LockedVibe | null = null;
    let faceBase64s: string[] = [];
    let outfitBase64s: string[] = [];
    let outputRatio: "4:5" | "2:3" | "16:9" = "4:5"; // ✅ 추가

    if (jsonBody) {
      fitSpec = jsonBody.fitSpec || "";
      shootingMode = jsonBody.shootingMode || "default";
      customPrompt = jsonBody.customPrompt || "";
      outfitMode = jsonBody.outfitMode || "outfit";
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

      faceBase64s = await Promise.all(facePaths.map(storagePathToBase64));
      outfitBase64s = await Promise.all(outfitPaths.map(storagePathToBase64));
    } else {
      const formData = await req.formData();

      fitSpec = (formData.get("fitSpec") as string) || "";
      shootingMode = (formData.get("shootingMode") as string) || "default";
      customPrompt = (formData.get("customPrompt") as string) || "";
      outfitMode = (formData.get("outfitMode") as string) || "outfit";
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
      outputRatio, // ✅ 핵심 추가
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