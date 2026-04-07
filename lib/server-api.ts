import { createClient, type User } from "@supabase/supabase-js";

const TEMP_INPUT_BUCKET = "temp-inputs";

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
