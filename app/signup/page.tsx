"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setMessage("이메일을 입력해주세요.");
      return;
    }

    if (!password) {
      setMessage("비밀번호를 입력해주세요.");
      return;
    }

    if (password.length < 6) {
      setMessage("비밀번호는 최소 6자 이상 입력해주세요.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });

      if (error) {
        setMessage(`오류: ${error.message}`);
        return;
      }

      if (data.user && !data.session) {
        setMessage("회원가입 완료. 이메일 인증 후 로그인해주세요.");
        return;
      }

      setMessage("회원가입 완료");
    } catch (error) {
      console.error(error);
      setMessage("회원가입 중 오류 발생");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
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
      console.error(error);
      setMessage("Google 로그인 오류");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="mx-auto max-w-md">
        <h1 className="mb-8 text-3xl font-bold">회원가입</h1>

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleSignup}
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
            onClick={handleSignup}
            disabled={loading}
            className="w-full rounded-xl bg-black py-3 text-white disabled:opacity-50"
          >
            {loading ? "가입 중..." : "회원가입"}
          </button>

          <div className="text-sm text-gray-600">
            이미 계정이 있으면{" "}
            <Link href="/login" className="underline">
              로그인
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