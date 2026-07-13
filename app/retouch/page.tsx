"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { RetouchPanel } from "@/components/retouch-panel";
import { useDropPaste } from "@/lib/use-drop-paste";

type LoadedImage = {
  base64: string;
  mime: string;
  name: string;
};

function stripDataUrlPrefix(value: string) {
  const commaIndex = value.indexOf(",");
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}

function detectMimeFromBase64(base64: string) {
  const head = base64.slice(0, 16);
  if (head.startsWith("iVBORw0KGgo")) return "image/png";
  if (head.startsWith("/9j/")) return "image/jpeg";
  if (head.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

export default function RetouchPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<LoadedImage | null>(null);
  const [resultBase64, setResultBase64] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState("");

  const resultMime = useMemo(
    () => (resultBase64 ? detectMimeFromBase64(resultBase64) : "image/jpeg"),
    [resultBase64],
  );

  const loadFile = (file: File | null) => {
    setError("");

    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      setSource({
        base64: stripDataUrlPrefix(raw),
        mime: file.type || detectMimeFromBase64(stripDataUrlPrefix(raw)),
        name: file.name,
      });
      setResultBase64("");
      setPanelOpen(true);
    };
    reader.onerror = () => setError("이미지를 읽지 못했습니다.");
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0] ?? null);
  };

  // 드래그&드롭 + Ctrl+V 붙여넣기 — 원본 영역 전체가 드롭존
  const { dragging, zoneProps } = useDropPaste((files) =>
    loadFile(files?.[0] ?? null)
  );

  const clearImage = () => {
    setSource(null);
    setResultBase64("");
    setPanelOpen(false);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#4c4a52]">
      <header className="border-b border-black/10 bg-[#f7f7f5]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-sm font-bold uppercase tracking-[-0.03em]">
            signature ai studio
          </Link>
          <div className="flex items-center gap-4 text-xs">
            <Link href="/studio" className="hover:opacity-60">
              studio
            </Link>
            <Link href="/fusion" className="hover:opacity-60">
              fusion
            </Link>
            <Link href="/dig" className="hover:opacity-60">
              dig
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div
          {...zoneProps}
          className={`space-y-4 outline-none rounded-2xl ${
            dragging ? "ring-2 ring-black/30" : ""
          }`}
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#8b8993]">
                single image retouch
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">
                부분 수정 테스트
              </h1>
            </div>
            {source && (
              <button
                type="button"
                onClick={clearImage}
                className="rounded-full border border-black/15 px-4 py-2 text-xs hover:bg-white"
              >
                reset
              </button>
            )}
          </div>

          {!source ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[520px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-black/25 bg-white/60 px-6 text-center transition hover:border-black/50 hover:bg-white"
            >
              <span className="text-sm font-semibold">이미지 1장 업로드</span>
              <span className="mt-2 max-w-sm text-xs leading-5 text-[#8b8993]">
                기존 생성 결과나 외부 이미지를 넣고, 리터칭 패널로 바로 부분 수정합니다.
              </span>
            </button>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <figure className="overflow-hidden rounded-2xl border border-black/10 bg-white">
                <div className="flex items-center justify-between border-b border-black/10 px-3 py-2 text-xs">
                  <span className="font-semibold">original</span>
                  <span className="truncate text-[#8b8993]">{source.name}</span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${source.mime};base64,${source.base64}`}
                  alt="Original upload"
                  className="h-auto w-full"
                />
              </figure>

              <figure className="overflow-hidden rounded-2xl border border-black/10 bg-white">
                <div className="flex items-center justify-between border-b border-black/10 px-3 py-2 text-xs">
                  <span className="font-semibold">retouched</span>
                  {resultBase64 && (
                    <a
                      href={`data:${resultMime};base64,${resultBase64}`}
                      download={`retouched-${source.name.replace(/\.[^.]+$/, "")}.jpg`}
                      className="text-[#8b8993] hover:text-black"
                    >
                      download
                    </a>
                  )}
                </div>
                {resultBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:${resultMime};base64,${resultBase64}`}
                    alt="Retouched result"
                    className="h-auto w-full"
                  />
                ) : (
                  <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-xs leading-5 text-[#8b8993]">
                    오른쪽 패널에서 수정하면 결과가 여기에 표시됩니다.
                  </div>
                )}
              </figure>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">retouch controls</h2>
              {source && !panelOpen && (
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  className="rounded-full bg-black px-3 py-1.5 text-xs text-white"
                >
                  open
                </button>
              )}
            </div>

            {!source ? (
              <p className="text-xs leading-5 text-[#8b8993]">
                이미지를 올리면 기존 리터칭 패널이 여기 붙습니다.
              </p>
            ) : panelOpen ? (
              <RetouchPanel
                imageBase64={resultBase64 || source.base64}
                onRetouched={setResultBase64}
                onClose={() => setPanelOpen(false)}
              />
            ) : (
              <p className="text-xs leading-5 text-[#8b8993]">
                패널을 닫았습니다. 다시 열어 이어서 수정할 수 있습니다.
              </p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
