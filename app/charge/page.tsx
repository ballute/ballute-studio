"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

declare global {
  interface Window {
    TossPayments: any;
  }
}

const PRODUCTS = [
  { price: 1000, points: 100, label: "Starter" },
  { price: 3000, points: 300, label: "Basic" },
  { price: 5000, points: 500, label: "Standard" },
];

function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export default function ChargePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<number>(PRODUCTS[0].price);

  const selectedProduct = useMemo(
    () => PRODUCTS.find((p) => p.price === selectedPrice) ?? PRODUCTS[0],
    [selectedPrice]
  );

  const handlePayment = async (amount: number, points: number) => {
    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        alert("로그인이 필요합니다.");
        router.push("/login");
        return;
      }

      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) {
        throw new Error("NEXT_PUBLIC_TOSS_CLIENT_KEY 없음");
      }

      const tossPayments = window.TossPayments(clientKey);
      const orderId = `order_${user.id}_${Date.now()}`;

      await tossPayments.requestPayment("카드", {
        amount,
        orderId,
        orderName: `${points} 포인트 충전`,
        successUrl: `${window.location.origin}/charge/success`,
        failUrl: `${window.location.origin}/charge/fail`,
      });
    } catch (e) {
      console.error(e);
      alert("결제 실행 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-6 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-gray-600 mb-4"
          >
            ← 홈으로
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-black">
            포인트 충전
          </h1>

          <p className="mt-4 text-sm md:text-base leading-7 text-gray-700 max-w-3xl">
            SIGNATURE AI STUDIO에서 이미지 생성에 사용할 포인트를 충전합니다.
            결제 전 상품 정보와 정책을 확인해 주세요.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
          <section className="border rounded-3xl bg-white p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">충전 상품 선택</h2>
              <div className="text-xs text-gray-500">1,000원 = 100P</div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {PRODUCTS.map((product) => {
                const selected = selectedProduct.price === product.price;

                return (
                  <button
                    key={product.price}
                    type="button"
                    onClick={() => setSelectedPrice(product.price)}
                    disabled={loading}
                    className={`w-full rounded-2xl border p-5 text-left transition ${
                      selected
                        ? "border-black bg-[#fafaf8]"
                        : "border-gray-300 bg-white hover:bg-[#fafaf8]"
                    } ${loading ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-2">
                          {product.label}
                        </div>
                        <div className="text-2xl font-bold text-black">
                          {product.points}P
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          {formatWon(product.price)}
                        </div>
                      </div>

                      {selected ? (
                        <div className="text-xs px-3 py-1 rounded-full border border-black text-black">
                          선택됨
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 rounded-3xl bg-black text-white p-6">
              <div className="text-sm text-white/70 mb-2">선택한 상품</div>
              <div className="text-3xl font-bold">
                {selectedProduct.points}P
              </div>
              <div className="mt-2 text-base text-white/80">
                {formatWon(selectedProduct.price)}
              </div>

              <div className="mt-6 space-y-2 text-sm leading-6 text-white/80">
                <p>충전된 포인트는 DIG / REFRUN / FUSION 실행 시 차감됩니다.</p>
                <p>
                  미사용 포인트는 환불 요청이 가능하며, 사용된 포인트는 환불되지
                  않습니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  handlePayment(selectedProduct.price, selectedProduct.points)
                }
                disabled={loading}
                className="mt-6 w-full rounded-2xl bg-white text-black py-4 text-base font-semibold disabled:opacity-60"
              >
                {loading
                  ? "결제창 준비중..."
                  : `${selectedProduct.points}P 결제하기`}
              </button>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="border rounded-3xl bg-white p-6">
              <h2 className="text-lg font-semibold mb-4">안내</h2>
              <div className="space-y-3 text-sm leading-6 text-gray-700">
                <p>포인트는 결제 완료 후 계정에 충전됩니다.</p>
                <p>
                  결제 후 포인트가 정상 반영되지 않을 경우, 잠시 후 다시 확인해
                  주세요.
                </p>
                <p>
                  문제가 지속되면 아래 이메일로 문의해 주세요:
                  <br />
                  official@ballute.co.kr
                </p>
              </div>
            </section>

            <section className="border rounded-3xl bg-white p-6">
              <h2 className="text-lg font-semibold mb-4">정책 확인</h2>
              <div className="flex flex-col gap-3 text-sm underline">
                <Link href="/terms">이용약관</Link>
                <Link href="/privacy-policy">개인정보처리방침</Link>
                <Link href="/refund-policy">환불규정</Link>
              </div>
            </section>

            <section className="border rounded-3xl bg-white p-6">
              <h2 className="text-lg font-semibold mb-4">사업자 정보</h2>
              <div className="space-y-2 text-sm leading-6 text-gray-700">
                <div>상호: SIGNATURE COMPANY</div>
                <div>대표자: 김순기</div>
                <div>사업자등록번호: 485-13-00268</div>
                <div>통신판매업 신고번호: 2026-서울중구-375</div>
                <div>
                  사업장 주소: 04563 서울특별시 중구 장충단로13길 20 (을지로6가)
                  현대시티타워 12층 무신사스튜디오 발루트
                </div>
                <div>연락처: 010-2710-9187</div>
                <div>이메일: official@ballute.co.kr</div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}