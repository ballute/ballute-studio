"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import HomeHeroAnimation from "@/components/home-hero-animation";

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
      } = await supabase.auth.getUser();

      if (!user) {
        setViewer(null);
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("point_balance")
        .eq("id", user.id)
        .maybeSingle();

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
    } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT") {
        setViewer(null);
        setLoading(false);
        setLogoutLoading(false);
        return;
      }

      setTimeout(() => {
        if (mounted) {
          loadViewer();
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      setLogoutLoading(true);

      const { error } = await supabase.auth.signOut({
        scope: "local",
      });

      if (error) {
        alert(`로그아웃 오류: ${error.message}`);
        setLogoutLoading(false);
        return;
      }

      setViewer(null);
      router.replace("/");
      router.refresh();

      setTimeout(() => {
        window.location.href = "/";
      }, 150);
    } catch (error) {
      console.error("로그아웃 예외:", error);
      alert("로그아웃 중 오류가 발생했습니다.");
      setLogoutLoading(false);
    }
  };

  return (
    <main className="h-[100svh] overflow-hidden bg-[#f7f7f5] text-[#6f6d78]">
      <div className="grid h-full grid-rows-[52px_minmax(0,1fr)]">
        <header className="z-30 border-b border-[rgba(111,109,120,0.14)] bg-[rgba(247,247,245,0.88)] backdrop-blur-md">
          <div className="flex h-[52px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="text-[14px] font-bold uppercase tracking-[-0.03em] text-[#6f6d78] sm:text-[18px]"
            >
              signature ai studio
            </Link>

            <div className="flex items-center gap-2 text-[11px] text-[#6f6d78] sm:gap-4 sm:text-[13px]">
              {loading ? (
                <div className="text-[#8b8993]">checking...</div>
              ) : viewer ? (
                <>
                  <div className="text-[#6f6d78]">{viewer.pointBalance}P</div>

                  <Link href="/mypage" className="transition hover:opacity-70">
                    mypage
                  </Link>

                  <Link href="/charge" className="transition hover:opacity-70">
                    charge
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={logoutLoading}
                    className="transition hover:opacity-70 disabled:opacity-50"
                  >
                    {logoutLoading ? "signing out..." : "logout"}
                  </button>
                </>
              ) : (
                <Link href="/login" className="transition hover:opacity-70">
                  login
                </Link>
              )}
            </div>
          </div>
        </header>

        <HomeHeroAnimation />
      </div>
    </main>
  );
}