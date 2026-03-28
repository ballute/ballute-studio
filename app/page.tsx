"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const lines = [
  {
    title: "DIG",
    href: "/dig",
    description:
      "무드 키워드 기반으로 리서치하고, 여러 크리에이티브 디렉션을 생성하는 생산 라인",
    points: [
      "모델 얼굴 여러 장",
      "의상 착샷 여러 장",
      "무드 키워드 입력",
      "count / fit / shooting mode",
    ],
  },
  {
    title: "REFRUN",
    href: "/refrun",
    description:
      "레퍼런스 이미지의 구도, 무드, 사진 문법을 분석해서 그대로 따라가는 생산 라인",
    points: [
      "모델 얼굴 여러 장",
      "의상 착샷 여러 장",
      "레퍼런스 이미지 여러 장",
      "fit / shooting mode",
    ],
  },
  {
    title: "FUSION",
    href: "/fusion",
    description:
      "배경 DNA와 포즈 블루프린트를 결합해서 고급 editorial 결과를 만드는 생산 라인",
    points: [
      "모델 얼굴 여러 장",
      "의상 착샷 여러 장",
      "배경 여러 장",
      "포즈 여러 장",
    ],
  },
];

type Viewer = {
  id: string;
  email: string | null;
  pointBalance: number;
} | null;

export default function HomePage() {
  const router = useRouter();

  const [viewer, setViewer] = useState<Viewer>(null);
  const [loading, setLoading] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const loadViewer = async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      console.log("홈 getUser:", user, userError);

      if (!user) {
        setViewer(null);
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("point_balance")
        .eq("id", user.id)
        .single();

      console.log("홈 profile:", profile, profileError);

      setViewer({
        id: user.id,
        email: user.email ?? null,
        pointBalance: profile?.point_balance ?? 0,
      });
    } catch (error) {
      console.error("홈 viewer 로드 오류:", error);
      setViewer(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!mounted) return;
      await loadViewer();
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async () => {
      if (!mounted) return;
      await loadViewer();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      setLogoutLoading(true);

      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("로그아웃 오류:", error);
        alert(`로그아웃 오류: ${error.message}`);
        return;
      }

      setViewer(null);
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("로그아웃 예외:", error);
      alert("로그아웃 중 오류가 발생했습니다.");
    } finally {
      setLogoutLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-6 py-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10">
          <h1 className="mb-4 text-5xl font-bold tracking-tight">
            BALLUTE STUDIO
          </h1>

          <div className="mb-6 flex flex-wrap gap-3">
            {loading ? (
              <div className="rounded-xl border bg-white px-4 py-2 text-sm text-gray-500">
                확인 중...
              </div>
            ) : viewer ? (
              <>
                <div className="rounded-xl border bg-white px-4 py-2 text-sm">
                  로그인됨: {viewer.email}
                </div>

                <div className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">
                  포인트: {viewer.pointBalance}P
                </div>

                <Link
                  href="/mypage"
                  className="rounded-xl border bg-white px-4 py-2 text-sm"
                >
                  마이페이지
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={logoutLoading}
                  className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {logoutLoading ? "로그아웃 중..." : "로그아웃"}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="rounded-xl border bg-white px-4 py-2 text-sm"
                >
                  회원가입
                </Link>

                <Link
                  href="/login"
                  className="rounded-xl bg-black px-4 py-2 text-sm text-white"
                >
                  로그인
                </Link>
              </>
            )}
          </div>

          <p className="max-w-3xl text-lg leading-8 text-gray-700">
            발루트 이미지 생산 시스템. 먼저 생산 라인을 선택하고, 그 라인에
            필요한 입력만 넣어서 작업을 시작한다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {lines.map((line) => (
            <Link
              key={line.title}
              href={line.href}
              className="block rounded-3xl border bg-white p-7 transition hover:shadow-md"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-3xl font-bold">{line.title}</h2>
                <span className="rounded-full border px-3 py-1 text-sm text-gray-600">
                  생산 라인
                </span>
              </div>

              <p className="mb-6 leading-7 text-gray-700">{line.description}</p>

              <div className="rounded-2xl border bg-[#fafaf8] p-4">
                <div className="mb-3 font-semibold">주요 입력</div>
                <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
                  {line.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-6">
                <div className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-medium text-white">
                  {line.title} 시작하기
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}