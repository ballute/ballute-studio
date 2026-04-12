import { createClient, type User } from "@supabase/supabase-js";

const TEMP_INPUT_BUCKET = "temp-inputs";
const DEFAULT_MAX_ACTIVE_BATCHES = 5;
const DEFAULT_BATCH_STALE_MINUTES = 30;

export type GenerationMode = "dig" | "fusion" | "refrun";

type SlotRpcResult = {
  success?: boolean;
  status?: "queued" | "active";
  code?: string;
  message?: string;
  queue_position?: number;
  active_count?: number;
  max_active?: number;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경변수가 없습니다.`);
  }

  return value;
}

function getEnvInt(name: string, fallback: number) {
  const raw = process.env[name];
  const value = Number(raw);

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function getAuthClient() {
  return createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function getAdminClient() {
  return createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export async function authenticateApiRequest(req: Request): Promise<User> {
  const accessToken = getBearerToken(req);

  if (!accessToken) {
    throw new ApiError(401, "로그인이 필요합니다.");
  }

  const authClient = getAuthClient();
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(accessToken);

  if (error || !user) {
    throw new ApiError(401, "로그인이 필요합니다.");
  }

  return user;
}

export function stripTempInputPrefix(path: string) {
  if (!path) return path;

  const prefix = `${TEMP_INPUT_BUCKET}/`;
  const gcsMatch = path.match(/^gs:\/\/[^/]+\/(.+)$/);

  if (gcsMatch?.[1]) {
    return gcsMatch[1];
  }

  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export function assertTempAssetOwnership(userId: string, paths: string[]) {
  const invalidPath = paths
    .map((path) => stripTempInputPrefix(path))
    .find((path) => path && !path.startsWith(`${userId}/`));

  if (invalidPath) {
    throw new ApiError(403, "자신의 업로드 파일만 사용할 수 있습니다.");
  }
}

export async function getUserPointBalance(userId: string) {
  const supabaseAdmin = getAdminClient();
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("point_balance")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "포인트 조회 중 오류 발생");
  }

  return Number(data?.point_balance ?? 0);
}

export async function ensureUserHasPoints(userId: string, amount: number) {
  const balance = await getUserPointBalance(userId);

  if (balance < amount) {
    throw new ApiError(402, "포인트가 부족합니다.");
  }
}

export async function spendUserPoints(
  userId: string,
  amount: number,
  reason: string
) {
  const supabaseAdmin = getAdminClient();
  const { data, error } = await supabaseAdmin.rpc("spend_points", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  });

  if (error) {
    const message =
      error.message || error.details || error.hint || "포인트 처리 중 오류 발생";

    throw new ApiError(
      message.includes("포인트 부족") ? 402 : 500,
      message
    );
  }

  if (!data?.success) {
    const message = data?.message || "포인트 처리 중 오류 발생";

    throw new ApiError(
      message.includes("포인트 부족") ? 402 : 500,
      message
    );
  }

  return data;
}

export async function reserveGenerationSlot(
  userId: string,
  batchId: string,
  mode: GenerationMode
) {
  const normalizedBatchId = batchId.trim();

  if (!normalizedBatchId) {
    throw new ApiError(400, "batchId가 필요합니다.");
  }

  const supabaseAdmin = getAdminClient();
  const { data, error } = await supabaseAdmin.rpc(
    "reserve_generation_slot",
    {
      p_user_id: userId,
      p_batch_id: normalizedBatchId,
      p_mode: mode,
      p_max_active: getEnvInt(
        "GENERATION_MAX_ACTIVE_BATCHES",
        DEFAULT_MAX_ACTIVE_BATCHES
      ),
      p_stale_after_minutes: getEnvInt(
        "GENERATION_BATCH_STALE_MINUTES",
        DEFAULT_BATCH_STALE_MINUTES
      ),
    }
  );

  if (error) {
    throw new ApiError(
      500,
      "실행 슬롯 제어 설정이 없습니다. Supabase SQL 적용을 확인해 주세요."
    );
  }

  const result = (data ?? {}) as SlotRpcResult;

  if (result.success) {
    return result;
  }

  if (result.code === "user_busy") {
    throw new ApiError(
      409,
      result.message ||
        "이미 다른 생성 작업이 실행 중입니다. 현재 작업이 끝난 뒤 다시 시도해 주세요."
    );
  }

  if (result.code === "queue_full") {
    throw new ApiError(
      429,
      result.message ||
        "현재 작업량이 많아 잠시 대기해야 합니다. 잠시 후 다시 시도해 주세요."
    );
  }

  throw new ApiError(
    500,
    result.message || "실행 슬롯 확보 중 오류가 발생했습니다."
  );
}

export async function ensureGenerationSlotActive(
  userId: string,
  batchId: string,
  mode: GenerationMode
) {
  const result = await reserveGenerationSlot(userId, batchId, mode);

  if (result.status === "active") {
    return result;
  }

  throw new ApiError(
    429,
    result.message || "현재 작업량이 많아 대기 중입니다. 잠시 후 다시 시도해 주세요."
  );
}

export async function releaseGenerationSlot(userId: string, batchId: string) {
  const normalizedBatchId = batchId.trim();

  if (!normalizedBatchId) {
    return { success: true };
  }

  const supabaseAdmin = getAdminClient();
  const { data, error } = await supabaseAdmin.rpc("release_generation_slot", {
    p_user_id: userId,
    p_batch_id: normalizedBatchId,
  });

  if (error) {
    throw new ApiError(
      500,
      "실행 슬롯 해제 설정이 없습니다. Supabase SQL 적용을 확인해 주세요."
    );
  }

  return (data ?? { success: true }) as SlotRpcResult;
}
