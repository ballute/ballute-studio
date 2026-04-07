import { supabase } from "@/lib/supabase";

/**
 * 포인트 차감 함수
 * @param amount 차감할 포인트
 * @param reason 로그 기록용 설명
 */
export async function spendPoints(amount: number, reason: string) {
  // 현재 로그인 유저 가져오기
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  // RPC 호출 (DB 함수 실행)
  const { data, error } = await supabase.rpc("spend_points", {
    p_user_id: user.id,
    p_amount: amount,
    p_reason: reason,
  });

  console.log("spend_points result:", data, error);

  if (error) {
    throw new Error("포인트 처리 중 오류 발생");
  }

  if (!data.success) {
    throw new Error(data.message);
  }

  return data;
}

export async function getCurrentPointBalance() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("users")
    .select("point_balance")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("포인트 조회 중 오류 발생");
  }

  return Number(data?.point_balance ?? 0);
}
