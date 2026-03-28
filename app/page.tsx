"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const lines = [
  {
    title: "DIG",
    href: "/dig",
    image: "/home-dig.jpg",
    tagline: "Creative direction based image generation",
    inputs: ["face", "outfit", "direction"],
  },
  {
    title: "REFRUN",
    href: "/refrun",
    image: "/home-refrun.jpg",
    tagline: "Reference-led image generation",
    inputs: ["face", "outfit", "reference photo"],
  },
  {
    title: "FUSION",
    href: "/fusion",
    image: "/home-fusion.jpg",
    tagline: "Background and pose driven generation",
    inputs: ["face", "outfit", "background", "pose"],
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
    <main className="min-h-screen bg-[#f7f7f5] text-[#73727c]">
      <div className="mx-auto max-w-[1440px] px-5 pb-16 pt-5 sm:px-6 lg:px-10">
        <header className="mb-10 border-b border-[#d9d7d2] pb-5">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-[720px]">
              <div className="mb-3 text-[13px] uppercase tracking-[0.24em] text-[#8b8993]">
                Ballute
              </div>

              <h1 className="text-[42px] font-bold leading-[0.95] tracking-[-0.04em] text-[#6f6d78] sm:text-[64px] lg:text-[82px]">
                SIGNATURE
                <br />
                STUDIO
              </h1>

              <p className="mt-5 max-w-[520px] text-[15px] leading-7 text-[#7c7a84] sm:text-base">
                AI lookbook production system for editorial-grade fashion imagery.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:min-w-[320px] sm:max-w-[420px]">
              <div className="flex flex-wrap gap-2">
                {loading ? (
                  <div className="rounded-full border border-[#cfcbd2] px-4 py-2 text-[13px]">
                    checking...
                  </div>
                ) : viewer ? (
                  <>
                    <div className="rounded-full border border-[#cfcbd2] px-4 py-2 text-[13px]">
                      {viewer.email}
                    </div>

                    <div className="rounded-full border border-[#cfcbd2] px-4 py-2 text-[13px]">
                      {viewer.pointBalance}P
                    </div>

                    <Link
                      href="/mypage"
                      className="rounded-full border border-[#cfcbd2] px-4 py-2 text-[13px] transition hover:bg-[#ece8ee]"
                    >
                      my page
                    </Link>

                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={logoutLoading}
                      className="rounded-full bg-[#6f6d78] px-4 py-2 text-[13px] text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {logoutLoading ? "signing out..." : "logout"}
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/signup"
                      className="rounded-full border border-[#cfcbd2] px-4 py-2 text-[13px] transition hover:bg-[#ece8ee]"
                    >
                      sign up
                    </Link>

                    <Link
                      href="/login"
                      className="rounded-full bg-[#6f6d78] px-4 py-2 text-[13px] text-white transition hover:opacity-90"
                    >
                      login
                    </Link>
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-[12px] uppercase tracking-[0.18em] text-[#8b8993]">
                <a href="#dig" className="hover:text-[#6f6d78]">
                  DIG
                </a>
                <a href="#refrun" className="hover:text-[#6f6d78]">
                  REFRUN
                </a>
                <a href="#fusion" className="hover:text-[#6f6d78]">
                  FUSION
                </a>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-16">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="relative overflow-hidden rounded-[28px] bg-[#ece8ee]">
              <div className="relative aspect-[4/5] sm:aspect-[16/13] lg:aspect-[16/11]">
                <Image
                  src="/home-dig.jpg"
                  alt="Signature Studio hero"
                  fill
                  priority
                  className="object-cover"
                />
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-[28px] border border-[#d9d7d2] bg-[#f7f7f5] p-6 sm:p-8">
              <div>
                <div className="mb-3 text-[12px] uppercase tracking-[0.2em] text-[#8b8993]">
                  AI LOOKBOOK STUDIO
                </div>

                <h2 className="max-w-[320px] text-[30px] font-bold leading-[1.02] tracking-[-0.04em] text-[#6f6d78] sm:text-[40px]">
                  Built for fashion image direction and production
                </h2>

                <p className="mt-5 max-w-[360px] text-[15px] leading-7 text-[#7c7a84]">
                  Create editorial-grade visuals through three production lines:
                  DIG, REFRUN and FUSION.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                <Link
                  href="/dig"
                  className="rounded-full bg-[#6f6d78] px-5 py-3 text-[13px] uppercase tracking-[0.08em] text-white transition hover:opacity-90"
                >
                  start with dig
                </Link>

                <Link
                  href="/mypage"
                  className="rounded-full border border-[#cfcbd2] px-5 py-3 text-[13px] uppercase tracking-[0.08em] transition hover:bg-[#ece8ee]"
                >
                  my page
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-12">
          {lines.map((line) => (
            <section
              key={line.title}
              id={line.title.toLowerCase()}
              className="grid gap-4 border-t border-[#d9d7d2] pt-6 sm:gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start"
            >
              <div className="order-2 flex flex-col justify-between lg:order-1 lg:min-h-[520px]">
                <div>
                  <div className="mb-3 text-[12px] uppercase tracking-[0.2em] text-[#8b8993]">
                    production line
                  </div>

                  <h3 className="text-[40px] font-bold leading-none tracking-[-0.05em] text-[#6f6d78] sm:text-[54px]">
                    {line.title}
                  </h3>

                  <p className="mt-5 max-w-[420px] text-[16px] leading-7 text-[#7c7a84]">
                    {line.tagline}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {line.inputs.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-[#cfcbd2] px-4 py-2 text-[12px] uppercase tracking-[0.12em]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-8">
                  <Link
                    href={line.href}
                    className="inline-flex rounded-full bg-[#6f6d78] px-5 py-3 text-[13px] uppercase tracking-[0.08em] text-white transition hover:opacity-90"
                  >
                    enter {line.title.toLowerCase()}
                  </Link>
                </div>
              </div>

              <div className="order-1 lg:order-2">
                <div className="relative overflow-hidden rounded-[24px] bg-[#ece8ee]">
                  <div className="relative aspect-[4/5] w-full">
                    <Image
                      src={line.image}
                      alt={line.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>
              </div>
            </section>
          ))}
        </section>
      </div>
    </main>
  );
}