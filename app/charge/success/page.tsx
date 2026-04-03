"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const AMOUNT_TO_POINTS: Record<number, number> = {
  1000: 100,
  3000: 300,
  5000: 500,
};

export default function SuccessPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("결제 승인 처리중...");
  const [chargedPoints, setChargedPoints] = useState<number>(0);

  const search = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search);
  }, []);

  useEffect(() => {
    if (!search) return;

    const paymentKey = search.get("paymentKey");
    const orderId = search.get("orderId");
    const amount = search.get("amount");

    const run = async () => {
      try {
        if (!paymentKey || !orderId || !amount) {
          throw new Error("결제 승인에 필요한 정보가 없습니다.");
        }

        const numericAmount = Number(amount);
        const points = AMOUNT_TO_POINTS[numericAmount] ?? 0;

        if (!points) {
          throw new Error("유효하지 않은 결제 금액입니다.");
        }

        const res = await fetch("/api/toss/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount: numericAmount,
            points,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "결제 승인 실패");
        }

        setChargedPoints(points);
        setStatus("success");
        setMessage("포인트 충전이 완료되었습니다.");
      } catch (error) {
        console.error(error);
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "충전 처리 중 오류가 발생했습니다."
        );
      }
    };

    run();
  }, [search]);

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border bg-white p-8 md:p-10">
          <div className="mb-6 text-sm text-gray-500">결제 결과</div>

          {status === "loading" && (
            <>
              <h1 className="text-3xl font-bold text-black mb-4">
                결제 승인 처리중
              </h1>
              <p className="text-base leading-7 text-gray-700">
                결제 정보를 확인하고 포인트를 반영하고 있습니다.
                잠시만 기다려 주세요.
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <h1 className="text-3xl font-bold text-black mb-4">충전 완료</h1>

              <p className="text-base leading-7 text-gray-700 mb-8">
                {message}
              </p>

              <div className="rounded-2xl border bg-[#fafaf8] p-5 mb-8">
                <div className="text-sm text-gray-500 mb-2">충전된 포인트</div>
                <div className="text-3xl font-bold text-black">
                  {chargedPoints}P
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/mypage"
                  className="inline-flex items-center justify-center rounded-2xl bg-black px-6 py-4 text-sm font-medium text-white transition hover:opacity-90"
                >
                  마이페이지로
                </Link>

                <Link
                  href="/charge"
                  className="inline-flex items-center justify-center rounded-2xl border px-6 py-4 text-sm font-medium text-black transition hover:bg-[#f3f3f1]"
                >
                  추가 충전하기
                </Link>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <h1 className="text-3xl font-bold text-black mb-4">
                충전 처리 실패
              </h1>

              <p className="text-base leading-7 text-red-500 mb-8">
                {message}
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/charge"
                  className="inline-flex items-center justify-center rounded-2xl bg-black px-6 py-4 text-sm font-medium text-white transition hover:opacity-90"
                >
                  다시 결제하기
                </Link>

                <Link
                  href="/mypage"
                  className="inline-flex items-center justify-center rounded-2xl border px-6 py-4 text-sm font-medium text-black transition hover:bg-[#f3f3f1]"
                >
                  마이페이지로
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}