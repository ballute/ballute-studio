import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fileToBase64 } from "@/lib/utils";
import {
  generateDigImageWeb,
  LockedVibe,
  DigDirection,
} from "@/lib/gemini-dig";

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
  lockedVibe?: LockedVibe | null;
  direction?: DigDirection;
  mixCaptions?: string[];
  facePaths?: string[];
  outfitPaths?: string[];
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
    let lockedVibe: LockedVibe | null = null;
    let direction = {} as DigDirection;
    let mixCaptions: string[] = [];
    let faceBase64s: string[] = [];
    let outfitBase64s: string[] = [];

    if (jsonBody) {
      fitSpec = jsonBody.fitSpec || "";
      shootingMode = jsonBody.shootingMode || "default";
      customPrompt = jsonBody.customPrompt || "";
      outfitMode = jsonBody.outfitMode || "outfit";
      lockedVibe = (jsonBody.lockedVibe || null) as LockedVibe | null;
      direction = (jsonBody.direction || {}) as DigDirection;
      mixCaptions = Array.isArray(jsonBody.mixCaptions)
        ? jsonBody.mixCaptions
        : [];

      const facePaths = Array.isArray(jsonBody.facePaths)
        ? jsonBody.facePaths
        : [];
      const outfitPaths = Array.isArray(jsonBody.outfitPaths)
        ? jsonBody.outfitPaths
        : [];

      if (!direction?.background && !direction?.mood) {
        return NextResponse.json(
          { error: "direction 정보가 필요하다." },
          { status: 400 }
        );
      }

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

      if (outfitMode === "mix" && mixCaptions.length !== outfitPaths.length) {
        return NextResponse.json(
          { error: "MIX 설명 수와 의상 이미지 수가 맞지 않는다." },
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
      const lockedVibeRaw = (formData.get("lockedVibe") as string) || "";
      const directionRaw = (formData.get("direction") as string) || "";
      const mixCaptionsRaw = (formData.get("mixCaptions") as string) || "[]";

      const faceFiles = formData.getAll("faces") as File[];
      const outfitFiles = formData.getAll("outfits") as File[];

      if (!directionRaw) {
        return NextResponse.json(
          { error: "direction 정보가 필요하다." },
          { status: 400 }
        );
      }

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

      direction = safeJsonParse<DigDirection>(directionRaw, {} as DigDirection);
      mixCaptions = safeJsonParse<string[]>(mixCaptionsRaw, []);
      lockedVibe = lockedVibeRaw
        ? safeJsonParse<LockedVibe | null>(lockedVibeRaw, null)
        : null;

      if (outfitMode === "mix" && mixCaptions.length !== outfitFiles.length) {
        return NextResponse.json(
          { error: "MIX 설명 수와 의상 이미지 수가 맞지 않는다." },
          { status: 400 }
        );
      }

      faceBase64s = await Promise.all(faceFiles.map(fileToBase64));
      outfitBase64s = await Promise.all(outfitFiles.map(fileToBase64));
    }

    const generated = await generateDigImageWeb({
      faceBase64s,
      outfitBase64s,
      dirSet: direction,
      bodySpecs: fitSpec,
      shootingMode,
      customPrompt: shootingMode === "custom" ? customPrompt : undefined,
      lockedVibe,
      isMixMode: outfitMode === "mix",
      mixCaptions,
    });

    return NextResponse.json({
      success: true,
      result: {
        image: generated.base64,
        summary: generated.summary,
        direction,
      },
    });
  } catch (error) {
    console.error("DIG_GENERATE_ONE_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "알 수 없는 generate-one 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}