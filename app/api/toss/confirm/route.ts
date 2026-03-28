import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount, points } = body;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 현재 유저 가져오기 (간단버전)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("유저 없음");
    }

    // 포인트 추가
    const { error } = await supabase.rpc("add_points", {
      p_user_id: user.id,
      p_amount: Number(points),
      p_reason: "충전",
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message },
      { status: 500 }
    );
  }
}