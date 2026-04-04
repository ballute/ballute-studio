import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TEMP_INPUT_BUCKET = "temp-inputs";
const TTL_MS = 2 * 60 * 60 * 1000;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin 설정 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인 필요"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    throw new Error("CRON_SECRET 환경변수가 없습니다.");
  }

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

function extractTimestampFromFileName(fileName: string) {
  const firstPart = fileName.split("_")[0];
  const ts = Number(firstPart);

  if (!Number.isFinite(ts) || ts <= 0) {
    return null;
  }

  return ts;
}

async function listAllFilesRecursively(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  bucket: string,
  folder = ""
): Promise<string[]> {
  const results: string[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(folder, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`스토리지 조회 실패 (${folder || "root"}): ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const item of data) {
      const itemPath = folder ? `${folder}/${item.name}` : item.name;

      const isFolder =
        !item.metadata &&
        !item.id &&
        !item.updated_at &&
        !item.created_at &&
        !item.last_accessed_at;

      if (isFolder) {
        const nested = await listAllFilesRecursively(supabaseAdmin, bucket, itemPath);
        results.push(...nested);
      } else {
        results.push(itemPath);
      }
    }

    if (data.length < limit) {
      break;
    }

    offset += limit;
  }

  return results;
}

function isExpiredByPath(path: string, now: number) {
  const fileName = path.split("/").pop();
  if (!fileName) return false;

  const ts = extractTimestampFromFileName(fileName);
  if (!ts) return false;

  return now - ts >= TTL_MS;
}

function chunkArray<T>(arr: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getAdminClient();
    const now = Date.now();

    const allPaths = await listAllFilesRecursively(
      supabaseAdmin,
      TEMP_INPUT_BUCKET,
      ""
    );

    const expiredPaths = allPaths.filter((path) => isExpiredByPath(path, now));

    if (expiredPaths.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: allPaths.length,
        removed: 0,
        removedPaths: [],
      });
    }

    const chunks = chunkArray(expiredPaths, 100);
    const removedPaths: string[] = [];

    for (const paths of chunks) {
      const { error } = await supabaseAdmin.storage
        .from(TEMP_INPUT_BUCKET)
        .remove(paths);

      if (error) {
        throw new Error(`스토리지 삭제 실패: ${error.message}`);
      }

      removedPaths.push(...paths);
    }

    return NextResponse.json({
      success: true,
      scanned: allPaths.length,
      removed: removedPaths.length,
      removedPaths,
    });
  } catch (error) {
    console.error("TEMP_ASSETS_CLEANUP_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "알 수 없는 cleanup 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}