"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setMessage("이메일을 입력해주세요.");
      return;
    }

    if (!password) {
      setMessage("비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        setMessage(`오류: ${error.message}`);
        return;
      }

      setMessage("로그인 완료");
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("로그인 예외:", error);
      setMessage("로그인 중 예상치 못한 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "https://studio.ballute.co.kr/",
        },
      });

      if (error) {
        setMessage(`오류: ${error.message}`);
        setLoading(false);
      }
    } catch (error) {
      console.error("Google 로그인 예외:", error);
      setMessage("Google 로그인 중 예상치 못한 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="mx-auto max-w-md">
        <h1 className="mb-8 text-3xl font-bold">로그인</h1>

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full rounded-xl border px-4 py-3 text-left disabled:opacity-50"
          >
            Google로 시작하기
          </button>

          <div className="text-center text-sm text-gray-500">또는</div>

          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border px-4 py-3"
          />

          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border px-4 py-3"
          />

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-xl bg-black py-3 text-white disabled:opacity-50"
          >
            {loading ? "처리 중..." : "로그인"}
          </button>

          <div className="text-sm text-gray-600">
            계정이 없으면{" "}
            <Link href="/signup" className="underline">
              회원가입
            </Link>
          </div>

          {message && (
            <div className="rounded-xl border p-4 text-sm text-gray-700">
              {message}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}