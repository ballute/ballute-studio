import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getNormalizedTossSecretKey } from "@/lib/toss";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { paymentKey, orderId, amount, points } = body;

    if (!paymentKey || !orderId || !amount || !points) {
      throw new Error("필수값 누락");
    }

    const secretKey = getNormalizedTossSecretKey(process.env.TOSS_SECRET_KEY);

    const tossResponse = await fetch(
      "https://api.tosspayments.com/v1/payments/confirm",
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${secretKey}:`).toString("base64"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount: Number(amount),
        }),
      }
    );

    const tossData = await tossResponse.json();

    if (!tossResponse.ok) {
      console.error("토스 승인 실패:", tossData);
      throw new Error(tossData?.message || "결제 승인 실패");
    }

    const orderParts = String(orderId).split("_");
    const userId = orderParts[1];

    if (!userId) {
      throw new Error("유저 식별 실패");
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
    }

    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase.rpc("add_points", {
      p_user_id: userId,
      p_amount: Number(points),
      p_reason: "충전",
    });

    if (error) {
      console.error("포인트 추가 실패:", error);
      throw new Error(
        error.message || error.details || error.hint || "포인트 지급 실패"
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (e: unknown) {
    console.error("confirm route error:", e);

    const message = e instanceof Error ? e.message : "알 수 없는 오류";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
