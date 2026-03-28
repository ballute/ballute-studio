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

        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("id, email, point_balance")
          .eq("id", user.id)
          .single();

        if (profileError || !profile) {
          console.error("profile 오류:", profileError);
          router.replace("/");
          return;
        }

        setViewer({
          id: profile.id,
          email: profile.email,
          pointBalance: profile.point_balance ?? 0,
        });

        const { data: pointLogs, error: logsError } = await supabase
          .from("point_logs")
          .select("id, type, amount, balance_after, reason, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (logsError) {
          console.error("point_logs 오류:", logsError);
          setLogs([]);
        } else {
          setLogs(pointLogs ?? []);
        }
      } catch (error) {
        console.error("mypage 로드 오류:", error);
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
      <main className="min-h-screen bg-[#f7f7f5] px-6 py-12">
        <div className="mx-auto max-w-5xl text-sm text-gray-500">불러오는 중...</div>
      </main>
    );
  }

  if (!viewer) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-gray-600 mb-4"
          >
            ← 홈으로
          </Link>

          <h1 className="text-4xl font-bold mb-3">마이페이지</h1>
          <p className="text-gray-700 text-lg leading-8">
            계정 정보와 포인트 사용 내역을 확인할 수 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 mb-8">
          <div className="rounded-3xl border bg-white p-6">
            <div className="text-sm text-gray-500 mb-2">로그인 계정</div>
            <div className="text-lg font-semibold break-all">{viewer.email}</div>
          </div>

          <div className="rounded-3xl border bg-white p-6">
            <div className="text-sm text-gray-500 mb-2">현재 잔액</div>
            <div className="text-3xl font-bold">{viewer.pointBalance}P</div>
          </div>

          <div className="rounded-3xl border bg-white p-6">
            <div className="text-sm text-gray-500 mb-2">총 사용 포인트</div>
            <div className="text-3xl font-bold">{totalUsedPoints}P</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mb-8">
          <div className="rounded-3xl border bg-white p-6">
            <div className="text-sm text-gray-500 mb-2">총 적립/충전 포인트</div>
            <div className="text-3xl font-bold">{totalChargedPoints}P</div>
          </div>

          <div className="rounded-3xl border bg-white p-6">
            <div className="text-sm text-gray-500 mb-2">로그 수</div>
            <div className="text-3xl font-bold">{logs.length}건</div>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-6">
          <div className="mb-4 text-2xl font-bold">최근 포인트 내역</div>

          {logs.length === 0 ? (
            <div className="text-sm text-gray-500">아직 내역이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col gap-2 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="font-semibold">{log.reason || "사유 없음"}</div>
                    <div className="text-sm text-gray-500">
                      {log.type} ·{" "}
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString("ko-KR")
                        : "-"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`font-bold ${
                        Number(log.amount) < 0 ? "text-red-500" : "text-blue-600"
                      }`}
                    >
                      {Number(log.amount) > 0 ? "+" : ""}
                      {log.amount}P
                    </div>
                    <div className="text-sm text-gray-500">
                      잔액 후: {log.balance_after ?? "-"}P
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