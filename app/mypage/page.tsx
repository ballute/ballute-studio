"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Viewer = {
  id: string;
  email: string | null;
  pointBalance: number;
};

type PointLog = {
  id: string;
  type: string;
  amount: number;
  balance_after: number | null;
  reason: string | null;
  created_at: string;
};

export default function MyPage() {
  const router = useRouter();

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [logs, setLogs] = useState<PointLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    const loadPage = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.replace("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("users")
          .select("id, email, point_balance")
          .eq("id", user.id)
          .maybeSingle();

        setViewer({
          id: user.id,
          email: profile?.email ?? user.email ?? null,
          pointBalance: profile?.point_balance ?? 0,
        });

        const { data: pointLogs } = await supabase
          .from("point_logs")
          .select("id, type, amount, balance_after, reason, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        setLogs(pointLogs ?? []);
      } catch (error) {
        console.error(error);
        setPageError("마이페이지 로드 실패");
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [router]);

  const totalUsedPoints = useMemo(() => {
    return logs
      .filter((log) => Number(log.amount) < 0)
      .reduce((sum, log) => sum + Math.abs(Number(log.amount)), 0);
  }, [logs]);

  const totalChargedPoints = useMemo(() => {
    return logs
      .filter((log) => Number(log.amount) > 0)
      .reduce((sum, log) => sum + Number(log.amount), 0);
  }, [logs]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        로딩중...
      </main>
    );
  }

  if (!viewer) return null;

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-6 py-12">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="mb-10">
          <Link href="/" className="text-sm text-gray-600 mb-4 inline-block">
            ← 홈으로
          </Link>
          <h1 className="text-4xl font-bold">마이페이지</h1>
        </div>

        {/* 핵심 카드 */}
        <div className="rounded-3xl border bg-white p-8 mb-10">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-6">

            <div>
              <div className="text-sm text-gray-500">현재 포인트</div>
              <div className="text-4xl font-bold">
                {viewer.pointBalance}P
              </div>
            </div>

            <Link
              href="/charge"
              className="bg-black text-white px-6 py-4 rounded-2xl text-lg text-center"
            >
              포인트 충전
            </Link>

          </div>
        </div>

        {/* 요약 */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          <div className="rounded-2xl border bg-white p-6">
            <div className="text-sm text-gray-500 mb-2">총 사용</div>
            <div className="text-2xl font-bold">{totalUsedPoints}P</div>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <div className="text-sm text-gray-500 mb-2">총 충전</div>
            <div className="text-2xl font-bold">{totalChargedPoints}P</div>
          </div>
        </div>

        {/* 로그 */}
        <div className="rounded-3xl border bg-white p-6">
          <div className="text-2xl font-bold mb-6">포인트 내역</div>

          {logs.length === 0 ? (
            <div className="text-gray-500">내역 없음</div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex justify-between border rounded-xl p-4"
                >
                  <div>
                    <div className="font-semibold">
                      {log.reason || "사유 없음"}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`font-bold ${
                        log.amount < 0 ? "text-red-500" : "text-blue-500"
                      }`}
                    >
                      {log.amount > 0 ? "+" : ""}
                      {log.amount}P
                    </div>
                    <div className="text-sm text-gray-400">
                      잔액 {log.balance_after ?? "-"}P
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}