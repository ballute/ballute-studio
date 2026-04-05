"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Viewer = {
  id: string;
  email: string | null;
  pointBalance: number;
} | null;

const panels = [
  {
    title: "DIG",
    href: "/dig",
    image: "/home-dig.jpg",
    guideImage: "/dic설명.jpg",
  },
  {
    title: "REFRUN",
    href: "/refrun",
    image: "/home-refrun.jpg",
    guideImage: "/refrun설명.jpg",
  },
  {
    title: "FUSION",
    href: "/fusion",
    image: "/home-fusion.jpg",
    guideImage: "/fusion설명.jpg",
  },
];

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

        <section className="min-h-0 overflow-y-auto snap-y snap-mandatory md:grid md:grid-cols-3 md:overflow-hidden md:snap-none">
          {panels.map((panel) => (
            <Link
              key={panel.title}
              href={panel.href}
              className="group relative block h-[calc(100svh-52px)] shrink-0 snap-start overflow-hidden md:h-full md:min-h-0"
            >
              <Image
                src={panel.image}
                alt={panel.title}
                fill
                priority
                className="object-cover transition duration-500 group-hover:scale-[1.015]"
              />

              <div className="absolute inset-0 bg-black/5 transition duration-300 group-hover:bg-black/10" />

              <div className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6 lg:left-7 lg:top-7">
                <div className="text-[16px] font-bold tracking-[0.08em] text-[#f7f7f5] drop-shadow-[0_2px_10px_rgba(0,0,0,0.28)] sm:text-[18px] lg:text-[20px]">
                  {panel.title}
                </div>
              </div>

              <div className="absolute bottom-4 right-4 z-10 w-[160px] sm:bottom-6 sm:right-6 sm:w-[180px] lg:bottom-7 lg:right-7 lg:w-[200px] xl:w-[220px]">
                <img
                  src={panel.guideImage}
                  alt={`${panel.title} guide`}
                  className="w-full rounded-[10px] border border-[rgba(111,109,120,0.22)] bg-[rgba(247,247,245,0.88)] shadow-[0_14px_32px_rgba(0,0,0,0.16)]"
                />
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}