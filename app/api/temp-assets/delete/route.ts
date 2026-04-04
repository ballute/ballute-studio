import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TEMP_INPUT_BUCKET = "temp-inputs";

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

function getAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase auth 설정 누락: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 확인 필요"
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return null;
  }

  return token;
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

function chunkArray<T>(arr: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

type DeleteBody = {
  sessionId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const accessToken = getBearerToken(req);

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authClient = getAuthClient();
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as DeleteBody;
    const sessionId = (body.sessionId || "").trim();

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId가 필요합니다." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getAdminClient();
    const targetPrefix = `${user.id}/${sessionId}`;

    const allPaths = await listAllFilesRecursively(
      supabaseAdmin,
      TEMP_INPUT_BUCKET,
      targetPrefix
    );

    if (allPaths.length === 0) {
      return NextResponse.json({
        success: true,
        removed: 0,
        removedPaths: [],
      });
    }

    const chunks = chunkArray(allPaths, 100);
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
      removed: removedPaths.length,
      removedPaths,
    });
  } catch (error) {
    console.error("TEMP_ASSETS_DELETE_ERROR:", error);

    const message =
      error instanceof Error ? error.message : "알 수 없는 temp 삭제 오류";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}