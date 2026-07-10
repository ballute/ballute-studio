"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 공홈(ballute-shop) BottomMenu 포팅 — 스튜디오 톤(#f7f7f5 배경, #73727c 텍스트)으로 조정.
// trigger: 화면 하단 가운데 작은 `menu` 텍스트.
// sheet: rounded-t + grab handle + backdrop blur, 항목 staggered reveal.
// 현재 페이지 항목은 검정으로 강조.

const SHEET_ITEMS = [
  { name: "dig", href: "/dig" },
  { name: "refrun", href: "/refrun" },
  { name: "fusion", href: "/fusion" },
  { name: "studio", href: "/studio" },
  { name: "retouch", href: "/retouch" },
];

export default function BottomMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 시트 열릴 때 body 스크롤 잠금
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* trigger — 화면 하단 가운데 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="open menu"
        className="fixed bottom-0 left-0 z-40 flex w-full items-end justify-center pb-4 pt-12"
        style={{
          background:
            "linear-gradient(to top, rgba(247,247,245,0.95) 0%, rgba(247,247,245,0.7) 50%, rgba(247,247,245,0) 100%)",
        }}
      >
        <span className="text-[13px] font-bold tracking-wide text-[#73727c] lowercase">
          menu
        </span>
      </button>

      {/* backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={`fixed inset-0 z-50 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ease-out ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="navigation menu"
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-2xl transition-transform duration-400 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* grab handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-[#73727c]/25" />
        </div>

        <nav className="px-8 pb-10 pt-2">
          <ul className="flex flex-col gap-4">
            {SHEET_ITEMS.map((item, i) => (
              <li
                key={item.href}
                className="bm-stagger"
                style={{
                  animationDelay: open ? `${120 + i * 40}ms` : "0ms",
                  animationPlayState: open ? "running" : "paused",
                  opacity: open ? undefined : 0,
                }}
              >
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block py-1 text-[15px] font-bold tracking-wide lowercase transition-opacity hover:opacity-60 ${
                    pathname === item.href ? "text-black" : "text-[#73727c]"
                  }`}
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-8 text-[12px] font-bold tracking-wide text-[#73727c]/50 lowercase transition-opacity hover:opacity-100"
          >
            close
          </button>
        </nav>
      </div>
    </>
  );
}
