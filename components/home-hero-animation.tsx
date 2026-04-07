"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

type MaterialAsset = {
  src: string;
  label: string;
  phase: number;
  from: {
    x: number;
    y: number;
    rotate: number;
  };
  to: {
    x: number;
    y: number;
    rotate: number;
  };
  width?: number;
};

type PanelItem = {
  title: string;
  href: string;
  main: string;
  face: MaterialAsset;
  outfit: MaterialAsset;
  support: MaterialAsset[];
};

const panels: PanelItem[] = [
  {
    title: "DIG",
    href: "/dig",
    main: "/dig-main.jpg",
    face: {
      src: "/dig-face.jpg",
      label: "FACE",
      phase: 1,
      from: { x: 16, y: 78, rotate: -8 },
      to: { x: 37, y: 51, rotate: -3 },
      width: 28,
    },
    outfit: {
      src: "/dig-outfit.jpg",
      label: "OUTFIT",
      phase: 2,
      from: { x: 84, y: 78, rotate: 8 },
      to: { x: 64, y: 60, rotate: 3 },
      width: 29,
    },
    support: [
      {
        src: "/dig-direction.jpg",
        label: "DIRECTION",
        phase: 3,
        from: { x: 50, y: 22, rotate: 0 },
        to: { x: 50, y: 36, rotate: 0 },
        width: 38,
      },
    ],
  },
  {
    title: "REFRUN",
    href: "/refrun",
    main: "/refrun-main.jpg",
    face: {
      src: "/refrun-face.jpg",
      label: "FACE",
      phase: 1,
      from: { x: 16, y: 78, rotate: -8 },
      to: { x: 37, y: 50, rotate: -3 },
      width: 28,
    },
    outfit: {
      src: "/refrun-outfit.jpg",
      label: "OUTFIT",
      phase: 2,
      from: { x: 84, y: 78, rotate: 8 },
      to: { x: 64, y: 59, rotate: 3 },
      width: 29,
    },
    support: [
      {
        src: "/refrun-reference.jpg",
        label: "REFERENCE",
        phase: 3,
        from: { x: 50, y: 22, rotate: 0 },
        to: { x: 50, y: 36, rotate: 0 },
        width: 38,
      },
    ],
  },
  {
    title: "FUSION",
    href: "/fusion",
    main: "/fusion-main.jpg",
    face: {
      src: "/fusion-face.jpg",
      label: "FACE",
      phase: 1,
      from: { x: 16, y: 78, rotate: -8 },
      to: { x: 37, y: 51, rotate: -3 },
      width: 28,
    },
    outfit: {
      src: "/fusion-outfit.jpg",
      label: "OUTFIT",
      phase: 2,
      from: { x: 84, y: 78, rotate: 8 },
      to: { x: 64, y: 60, rotate: 3 },
      width: 29,
    },
    support: [
      {
        src: "/fusion-bg.jpg",
        label: "BG",
        phase: 3,
        from: { x: 18, y: 22, rotate: -6 },
        to: { x: 34, y: 34, rotate: -2 },
        width: 31,
      },
      {
        src: "/fusion-pose.jpg",
        label: "POSE",
        phase: 3,
        from: { x: 82, y: 22, rotate: 6 },
        to: { x: 66, y: 35, rotate: 2 },
        width: 24,
      },
    ],
  },
];

const LOOPS = 2;
const START_DELAY_MS = 150;
const STAGE_GAP_MS = 900;
const LAST_STAGE_GAP_MS = 1300;
const SHARP_HOLD_MS = 750;

function AnimatedCard({
  asset,
  active,
  emphasize = false,
}: {
  asset: MaterialAsset;
  active: boolean;
  emphasize?: boolean;
}) {
  const width = asset.width ?? 30;

  return (
    <AnimatePresence mode="wait">
      {active ? (
        <motion.div
          key={`${asset.src}-${asset.phase}`}
          className="pointer-events-none absolute z-30 overflow-hidden rounded-[16px] border border-white/30 bg-[rgba(250,249,246,0.94)] shadow-[0_28px_60px_rgba(0,0,0,0.16)] backdrop-blur-md"
          style={{
            width: `${emphasize ? width + 6 : width}%`,
            maxWidth: emphasize ? "240px" : "196px",
            minWidth: emphasize ? "136px" : "112px",
          }}
          initial={{
            left: `${asset.from.x}%`,
            top: `${asset.from.y}%`,
            x: "-50%",
            y: "-50%",
            opacity: 0,
            scale: 0.8,
            rotate: asset.from.rotate,
            filter: "blur(12px)",
          }}
          animate={{
            left: [`${asset.from.x}%`, `${asset.to.x}%`],
            top: [`${asset.from.y}%`, `${asset.to.y}%`],
            x: "-50%",
            y: "-50%",
            opacity: [0, 1, 0.86, 0],
            scale: emphasize ? [0.8, 1.04, 1.04, 0.96] : [0.8, 1, 1, 0.94],
            rotate: [asset.from.rotate, asset.to.rotate],
            filter: ["blur(12px)", "blur(0px)", "blur(0px)", "blur(5px)"],
          }}
          exit={{ opacity: 0 }}
          transition={{
            duration: emphasize ? 1.25 : 0.95,
            times: emphasize ? [0, 0.2, 0.82, 1] : [0, 0.22, 0.72, 1],
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="aspect-[0.9] w-full overflow-hidden">
            <img src={asset.src} alt={asset.label} className="h-full w-full object-cover" />
          </div>
          <div className="px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-[#6f6d78] sm:text-[11px]">
            {asset.label}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function FinalCard({
  asset,
  className,
}: {
  asset: MaterialAsset;
  className: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className={`absolute z-30 overflow-hidden rounded-[16px] border border-white/35 bg-[rgba(250,249,246,0.92)] shadow-[0_20px_40px_rgba(0,0,0,0.15)] backdrop-blur-md ${className}`}
    >
      <div className="aspect-[1.05] w-full overflow-hidden">
        <img src={asset.src} alt={asset.label} className="h-full w-full object-cover" />
      </div>
      <div className="px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-[#6f6d78] sm:text-[11px]">
        {asset.label}
      </div>
    </motion.div>
  );
}

function Panel({ panel }: { panel: PanelItem }) {
  const [phase, setPhase] = useState(0);
  const [finished, setFinished] = useState(false);
  const lastMaterialPhase = 3;
  const finalPhase = lastMaterialPhase + 1;

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

    const scheduleLoop = (loopIndex: number) => {
      if (cancelled) return;

      const lastRevealAt = START_DELAY_MS + (lastMaterialPhase - 1) * STAGE_GAP_MS;
      const finalRevealAt = lastRevealAt + LAST_STAGE_GAP_MS;
      const loopEndAt = finalRevealAt + SHARP_HOLD_MS;

      setPhase(0);

      timers.push(window.setTimeout(() => setPhase(1), START_DELAY_MS));
      timers.push(window.setTimeout(() => setPhase(2), START_DELAY_MS + STAGE_GAP_MS));
      timers.push(window.setTimeout(() => setPhase(3), lastRevealAt));
      timers.push(window.setTimeout(() => setPhase(finalPhase), finalRevealAt));

      if (loopIndex + 1 < LOOPS) {
        timers.push(window.setTimeout(() => scheduleLoop(loopIndex + 1), loopEndAt));
      } else {
        timers.push(
          window.setTimeout(() => {
            setPhase(finalPhase);
            setFinished(true);
          }, loopEndAt),
        );
      }
    };

    scheduleLoop(0);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [finalPhase]);

  const clarity = finished ? 1 : Math.min(phase / finalPhase, 1);
  const sharpOpacity = 0.08 + clarity * 0.92;
  const blurAmount = Math.max(24 - clarity * 22, 0);
  const overlayOpacity = finished ? 0.08 : 0.52 - clarity * 0.42;
  const supportCards = panel.support;

  return (
    <Link
      href={panel.href}
      className="group relative block h-[calc(100svh-52px)] shrink-0 snap-start overflow-hidden bg-[#efede7] md:h-full md:min-h-0"
    >
      <div className="absolute inset-0">
        <motion.img
          src={panel.main}
          alt={panel.title}
          className="absolute inset-0 h-full w-full scale-[1.04] object-cover"
          initial={false}
          animate={{
            filter: `blur(${blurAmount}px) saturate(${0.88 + clarity * 0.14}) brightness(${1.04 - clarity * 0.04})`,
            scale: 1.04 - clarity * 0.04,
          }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />

        <motion.img
          src={panel.main}
          alt={panel.title}
          className="absolute inset-0 h-full w-full object-cover"
          initial={false}
          animate={{
            opacity: sharpOpacity,
            filter: `blur(${Math.max(10 - clarity * 10, 0)}px)`,
          }}
          transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        />

        <motion.div
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(247,247,245,0.54),rgba(247,247,245,0.12)_38%,rgba(247,247,245,0.04)_100%)]"
          initial={false}
          animate={{ opacity: overlayOpacity }}
          transition={{ duration: 0.72, ease: "easeOut" }}
        />

        <motion.div
          className="absolute inset-0 bg-black/10"
          initial={false}
          animate={{ opacity: finished ? 0.02 : 0.08 - clarity * 0.04 }}
          transition={{ duration: 0.72 }}
        />
      </div>

      <div className="absolute left-4 top-4 z-40 sm:left-6 sm:top-6 lg:left-7 lg:top-7">
        <div className="text-[16px] font-bold tracking-[0.08em] text-[#f7f7f5] drop-shadow-[0_2px_12px_rgba(0,0,0,0.24)] sm:text-[18px] lg:text-[20px]">
          {panel.title}
        </div>
      </div>

      {!finished ? (
        <>
          <AnimatedCard asset={panel.face} active={phase === 1} />
          <AnimatedCard asset={panel.outfit} active={phase === 2} />
          {panel.support.map((asset) => (
            <AnimatedCard
              key={`${panel.title}-${asset.label}`}
              asset={asset}
              active={phase === 3}
              emphasize
            />
          ))}
        </>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-4 top-5 z-30 rounded-full border border-white/40 bg-[rgba(15,15,15,0.28)] px-3 py-2 text-[10px] font-semibold tracking-[0.16em] text-white backdrop-blur-md sm:right-6 sm:top-6 sm:px-4 sm:text-[11px] md:hidden"
          >
            <span className="mr-2">OTHER MODES</span>
            <span aria-hidden="true">&larr; &rarr;</span>
          </motion.div>

          <FinalCard asset={panel.face} className="left-5 top-20 w-[26%] max-w-[164px] min-w-[100px]" />
          <FinalCard asset={panel.outfit} className="right-5 top-20 w-[26%] max-w-[164px] min-w-[100px]" />

          <div className="absolute bottom-6 left-4 right-4 z-30 flex items-end justify-center gap-3">
            {supportCards.map((asset) => (
              <FinalCard
                key={`${panel.title}-${asset.label}-final`}
                asset={asset}
                className="relative w-[28%] max-w-[170px] min-w-[104px]"
              />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-32 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/45 bg-[rgba(15,15,15,0.38)] px-4 py-2 text-[11px] font-semibold tracking-[0.16em] text-white backdrop-blur-md sm:text-[12px]"
          >
            SELECT {panel.title}
          </motion.div>
        </>
      )}
    </Link>
  );
}

export default function HomeHeroAnimation() {
  return (
    <section className="min-h-0 overflow-y-auto snap-y snap-mandatory md:grid md:grid-cols-3 md:overflow-hidden md:snap-none">
      {panels.map((panel) => (
        <Panel key={panel.title} panel={panel} />
      ))}
    </section>
  );
}
