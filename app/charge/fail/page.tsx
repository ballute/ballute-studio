"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function FailPage() {
  const searchParams = useSearchParams();

  const code = searchParams.get("code");
  const message = searchParams.get("message");

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border bg-white p-8 md:p-10">
          <div className="mb-6 text-sm text-gray-500">결제 결과</div>

          <h1 className="text-3xl font-bold text-black mb-4">결제 실패</h1>

          <p className="text-base leading-7 text-gray-700 mb-8">
            결제가 정상적으로 완료되지 않았습니다.
            다시 시도하시거나 다른 결제 수단으로 진행해 주세요.
          </p>

          <div className="space-y-3 rounded-2xl border bg-[#fafaf8] p-5 mb-8">
            <div className="text-sm text-gray-500">실패 코드</div>
            <div className="text-base font-medium text-black">
              {code || "-"}
            </div>

            <div className="pt-2 text-sm text-gray-500">실패 사유</div>
            <div className="text-base font-medium text-black break-words">
              {message || "알 수 없는 오류"}
            </div>
          </div>

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
        </div>
      </div>
    </main>
  );
}