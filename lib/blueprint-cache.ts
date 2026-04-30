// 영구 캐시 헬퍼: face/pose/bg/location 분석 결과를 Supabase에 저장/조회.
// 같은 입력이면 항상 같은 분석 결과 → 캐싱해도 품질 영향 없음.
// cache 자체 실패는 silent — 캐시가 죽어도 분석은 그대로 동작해야 함.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

let cachedClient: SupabaseClient | null = null;
function adminClient(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return cachedClient;
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function getCachedAnalysis<T>(
  cacheKey: string
): Promise<T | null> {
  try {
    const { data, error } = await adminClient()
      .from("genai_analysis_cache")
      .select("result")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (error || !data) return null;

    void adminClient()
      .from("genai_analysis_cache")
      .update({ last_used_at: new Date().toISOString() })
      .eq("cache_key", cacheKey)
      .then(
        () => undefined,
        () => undefined
      );

    return data.result as T;
  } catch {
    return null;
  }
}

export async function setCachedAnalysis<T>(
  cacheKey: string,
  result: T
): Promise<void> {
  try {
    await adminClient()
      .from("genai_analysis_cache")
      .upsert(
        {
          cache_key: cacheKey,
          result,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" }
      );
  } catch {
    // silent
  }
}
