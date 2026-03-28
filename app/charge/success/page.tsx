"use client";

import { useEffect, useState } from "react";

export default function SuccessPage() {
  const [message, setMessage] = useState("처리중...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const amount = params.get("amount");
    const points = params.get("points");

    const run = async () => {
      try {
        const res = await fetch("/api/toss/confirm", {
          method: "POST",
          body: JSON.stringify({
            amount,
            points,
          }),
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        setMessage("충전 완료");
      } catch (e) {
        console.error(e);
        setMessage("충전 실패");
      }
    };

    run();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-xl">{message}</div>
    </main>
  );
}