"use client";

import { useState } from "react";

declare global {
  interface Window {
    TossPayments: any;
  }
}

const PRODUCTS = [
  { price: 1000, points: 100 },
  { price: 3000, points: 300 },
  { price: 5000, points: 500 },
];

export default function ChargePage() {
  const [loading, setLoading] = useState(false);

  const handlePayment = async (amount: number, points: number) => {
    setLoading(true);

    try {
      const tossPayments = window.TossPayments(
        process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
      );

      const orderId = `order_${Date.now()}`;

      await tossPayments.requestPayment("카드", {
        amount,
        orderId,
        orderName: `${points} 포인트 충전`,
        successUrl: `${window.location.origin}/charge/success?amount=${amount}&points=${points}`,
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
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold mb-8">포인트 충전</h1>

        <div className="space-y-4">
          {PRODUCTS.map((p) => (
            <button
              key={p.price}
              onClick={() => handlePayment(p.price, p.points)}
              disabled={loading}
              className="w-full border rounded-xl px-4 py-4 text-left"
            >
              <div className="font-semibold">{p.points}P</div>
              <div className="text-sm text-gray-600">{p.price}원</div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}