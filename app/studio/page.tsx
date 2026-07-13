"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RetouchPanel } from "@/components/retouch-panel";
import { getAccessToken } from "@/lib/supabase";
import { useDropPaste } from "@/lib/use-drop-paste";
import {
  ASPECT_RATIO_OPTIONS,
  DEFAULT_ASPECT_RATIO,
  type Gender,
  type OutfitTag,
  type OutputRatio,
  type StudioShot,
} from "@/lib/studio-types";

type OutfitItem = {
  file: File;
  preview: string;
  tag: OutfitTag;
};

type ShotResult = {
  shot: StudioShot;
  url: string | null;
  retouchedUrl?: string;
  retouchOpen?: boolean;
};

// data:image/png;base64,xxx → xxx
function stripDataUrlPrefix(url: string): string {
  return url.replace(/^data:image\/[^;]+;base64,/, "");
}

const OUTFIT_TAGS: { value: OutfitTag; label: string }[] = [
  { value: "front",  label: "정면" },
  { value: "fabric", label: "원단" },
  { value: "back",   label: "후면" },
  { value: "detail", label: "디테일" },
];

const FULL_BODY_SHOTS: { value: StudioShot; label: string }[] = [
  { value: "front",    label: "정면" },
  { value: "45deg",    label: "45°" },
  { value: "back",     label: "뒤" },
  { value: "freepose", label: "프리포즈" },
];

const DETAIL_SHOTS: { value: StudioShot; label: string }[] = [
  { value: "upperbody", label: "상반신" },
  { value: "lowerbody", label: "하반신" },
];

const SHOT_LABELS: Record<StudioShot, string> = {
  front: "정면",
  "45deg": "45°",
  back: "뒤",
  freepose: "프리포즈",
  upperbody: "상반신",
  lowerbody: "하반신",
};

const GENDERS: { value: Gender; label: string; sub: string }[] = [
  { value: "male", label: "남성", sub: "184cm / 65kg" },
  { value: "female", label: "여성", sub: "172cm / 50kg" },
];

const MAX_OUTFIT_ITEMS = 4;

const LABELABLE_SHOTS: StudioShot[] = ["freepose", "upperbody", "lowerbody"];
const LABEL_PLACEHOLDER: Partial<Record<StudioShot, string>> = {
  freepose: "예: 양손 주머니에 넣고 살짝 옆으로 기대기",
  upperbody: "예: 어깨 더 보여줘 / 칼라 클로즈업",
  lowerbody: "예: 왼쪽 카고포켓 클로즈업 / 헴 드레이프 강조",
};

// 디테일컷에서 "프리포즈" 토글 가능한 샷
const DETAIL_FREEPOSE_SHOTS: StudioShot[] = ["upperbody", "lowerbody"];

export default function StudioPage() {
  const router = useRouter();
  const [outfitItems, setOutfitItems] = useState<OutfitItem[]>([]);
  const [sourceSpecs, setSourceSpecs] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [selectedShots, setSelectedShots] = useState<Set<StudioShot>>(
    new Set(["front", "45deg", "back", "upperbody"])
  );
  const [shotLabels, setShotLabels] = useState<Partial<Record<StudioShot, string>>>({});
  const [detailFreepose, setDetailFreepose] = useState<Set<StudioShot>>(new Set());
  const [aspectRatio, setAspectRatio] = useState<OutputRatio>(DEFAULT_ASPECT_RATIO);
  const [freeposeRef, setFreeposeRef] = useState<{ file: File; preview: string } | null>(null);
  const [generating, setGenerating] = useState<Set<StudioShot>>(new Set());
  const [results, setResults] = useState<ShotResult[]>([]);
  const [errors, setErrors] = useState<Partial<Record<StudioShot, string>>>({});

  const handleOutfitAdd = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const currentCount = outfitItems.length;
    const toAdd = Array.from(files).slice(0, MAX_OUTFIT_ITEMS - currentCount);
    if (!toAdd.length) return;
    const oversized = toAdd.filter((f) => f.size > 10 * 1024 * 1024);
    if (oversized.length) {
      alert("10MB 이하 이미지만 업로드할 수 있습니다.");
      return;
    }
    const newItems: OutfitItem[] = toAdd.map((file, i) => ({
      file,
      preview: URL.createObjectURL(file),
      tag: currentCount === 0 && i === 0 ? "front" : "fabric",
    }));
    setOutfitItems((prev) => [...prev, ...newItems]);
    setResults([]);
  };

  const handleTagChange = (index: number, tag: OutfitTag) => {
    setOutfitItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, tag } : item))
    );
  };

  const handleOutfitRemove = (index: number) => {
    setOutfitItems((prev) => prev.filter((_, i) => i !== index));
    setResults([]);
  };

  const toggleShot = (shot: StudioShot) => {
    setSelectedShots((prev) => {
      const next = new Set(prev);
      if (next.has(shot)) {
        if (next.size === 1) return prev;
        next.delete(shot);
      } else {
        next.add(shot);
      }
      return next;
    });
  };

  const handleLabelChange = (shot: StudioShot, value: string) => {
    setShotLabels((prev) => ({ ...prev, [shot]: value }));
  };

  const toggleDetailFreepose = (shot: StudioShot) => {
    setDetailFreepose((prev) => {
      const next = new Set(prev);
      if (next.has(shot)) next.delete(shot);
      else next.add(shot);
      return next;
    });
  };

  const handleFreeposeRefAdd = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 10 * 1024 * 1024) {
      alert("10MB 이하 이미지만 업로드할 수 있습니다.");
      return;
    }
    setFreeposeRef({ file, preview: URL.createObjectURL(file) });
  };

  const handleFreeposeRefRemove = () => {
    setFreeposeRef(null);
  };

  // 드래그&드롭 + (영역 클릭 후) Ctrl+V 붙여넣기 — 착샷 카드 / 포즈 레퍼런스 각각
  const outfitZone = useDropPaste(handleOutfitAdd);
  const freeposeZone = useDropPaste(handleFreeposeRefAdd);

  const handleGenerate = async () => {
    if (!outfitItems.length) {
      alert("착샷을 업로드해주세요.");
      return;
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch {
      alert("로그인이 필요합니다.");
      router.push("/login");
      return;
    }

    const shots = Array.from(selectedShots);
    setResults([]);
    setErrors({});
    setGenerating(new Set(shots));

    // 샷별 순차 호출 — 정면 완료 후 45° 시작, 45° 완료 후 뒤 시작
    for (const shot of shots) {
      try {
        const formData = new FormData();
        outfitItems.forEach((item) => {
          formData.append("outfit", item.file);
          formData.append("outfitTag", item.tag);
        });
        formData.append("gender", gender);
        formData.append("shot", shot);
        formData.append("aspectRatio", aspectRatio);
        if (sourceSpecs.trim()) {
          formData.append("sourceSpecs", sourceSpecs.trim());
        }
        const label = shotLabels[shot]?.trim();
        if (label) {
          formData.append("label", label);
        }
        if (shot === "freepose" && freeposeRef) {
          formData.append("poseRef", freeposeRef.file);
        }
        if (DETAIL_FREEPOSE_SHOTS.includes(shot) && detailFreepose.has(shot)) {
          formData.append("detailFreepose", "1");
        }

        const res = await fetch("/api/studio/generate-one", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "생성 실패");
        }

        setResults((prev) => [...prev, { shot, url: data.url }]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "오류가 발생했습니다.";
        setErrors((prev) => ({ ...prev, [shot]: msg }));
        setResults((prev) => [...prev, { shot, url: null }]);
      } finally {
        setGenerating((prev) => {
          const next = new Set(prev);
          next.delete(shot);
          return next;
        });
      }
    }
  };

  const handleDownload = async (url: string, shot: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `horizon-studio-${shot}.png`;
    a.click();
  };

  const renderShotButton = (value: StudioShot, label: string) => {
    const selected = selectedShots.has(value);
    const labelable = LABELABLE_SHOTS.includes(value);
    const labelValue = shotLabels[value] ?? "";
    const isDetailFreeposable = DETAIL_FREEPOSE_SHOTS.includes(value);
    const detailFreeposeOn = detailFreepose.has(value);
    return (
      <div key={value} className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => toggleShot(value)}
          className={`px-4 py-2 rounded-xl text-sm border transition self-start ${
            selected
              ? "bg-black text-white border-black"
              : "border-gray-300 text-gray-400"
          }`}
        >
          {label}
        </button>
        {selected && isDetailFreeposable && (
          <button
            type="button"
            onClick={() => toggleDetailFreepose(value)}
            className={`self-start px-3 py-1 rounded-lg text-xs border transition ${
              detailFreeposeOn
                ? "bg-black text-white border-black"
                : "border-gray-300 text-gray-500"
            }`}
          >
            프리포즈 {detailFreeposeOn ? "ON" : "OFF"}
          </button>
        )}
        {selected && labelable && (
          <input
            type="text"
            value={labelValue}
            onChange={(e) => handleLabelChange(value, e.target.value)}
            placeholder={LABEL_PLACEHOLDER[value] ?? "비워두면 디폴트"}
            className="w-full border rounded-lg px-3 py-2 text-xs"
          />
        )}
        {selected && value === "freepose" && (
          freeposeRef ? (
            <div className="flex gap-2 items-center">
              <img
                src={freeposeRef.preview}
                alt="포즈 레퍼런스"
                className="w-12 h-12 object-cover rounded-lg border"
              />
              <span className="text-xs text-gray-500 flex-1 truncate">
                {freeposeRef.file.name}
              </span>
              <button
                type="button"
                onClick={handleFreeposeRefRemove}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ×
              </button>
            </div>
          ) : (
            <label
              {...freeposeZone.zoneProps}
              className={`cursor-pointer text-xs px-3 py-2 border border-dashed rounded-lg text-gray-500 hover:border-gray-400 transition text-center block outline-none ${
                freeposeZone.dragging ? "border-black ring-2 ring-black/30" : ""
              }`}
            >
              + 포즈 레퍼런스 사진 (선택)
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFreeposeRefAdd(e.target.files)}
              />
            </label>
          )
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Horizon Studio</h1>
          <p className="text-sm text-gray-500 mt-1">
            착샷에서 전신 · 디테일 룩북 컷 생성
          </p>
        </div>

        <div className="space-y-5">
          {/* 착샷 업로드 */}
          <div
            {...outfitZone.zoneProps}
            className={`border rounded-2xl p-6 bg-white outline-none transition-shadow ${
              outfitZone.dragging ? "border-black ring-2 ring-black/30 bg-gray-50" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-bold">착샷 업로드</h2>
                <p className="text-xs text-gray-400 mt-0.5">최대 {MAX_OUTFIT_ITEMS}장 · 각도·디테일별로 추가할수록 정확도 상승</p>
              </div>
              {outfitItems.length > 0 && outfitItems.length < MAX_OUTFIT_ITEMS && (
                <label className="cursor-pointer text-xs px-3 py-1.5 border rounded-lg text-gray-600 hover:border-gray-400 transition">
                  + 추가
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleOutfitAdd(e.target.files)}
                  />
                </label>
              )}
            </div>

            {outfitItems.length === 0 ? (
              <label className="block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 transition">
                <p className="text-sm text-gray-400">클릭해서 착샷 업로드 (10MB 이하)</p>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleOutfitAdd(e.target.files)}
                />
              </label>
            ) : (
              <div className="space-y-3">
                {outfitItems.map((item, index) => (
                  <div key={index} className="flex gap-3 items-center">
                    <img
                      src={item.preview}
                      alt={`착샷 ${index + 1}`}
                      className="w-16 h-16 object-cover rounded-lg border flex-shrink-0"
                    />
                    <div className="flex gap-1.5 flex-wrap flex-1">
                      {OUTFIT_TAGS.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => handleTagChange(index, t.value)}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition ${
                            item.tag === t.value
                              ? "bg-black text-white border-black"
                              : "border-gray-300 text-gray-500"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOutfitRemove(index)}
                      className="text-gray-300 hover:text-gray-500 text-lg leading-none flex-shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 모델 성별 */}
          <div className="border rounded-2xl p-6 bg-white">
            <h2 className="text-base font-bold mb-1">모델</h2>
            <p className="text-xs text-gray-400 mb-3">출력 모델 스펙 고정</p>
            <div className="flex gap-2">
              {GENDERS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGender(g.value)}
                  className={`flex-1 py-3 rounded-xl text-sm border transition ${
                    gender === g.value
                      ? "bg-black text-white border-black"
                      : "border-gray-300 text-gray-600"
                  }`}
                >
                  <div className="font-medium">{g.label}</div>
                  <div className={`text-xs mt-0.5 ${gender === g.value ? "text-gray-300" : "text-gray-400"}`}>
                    {g.sub}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 착샷 인물 스펙 */}
          <div className="border rounded-2xl p-6 bg-white">
            <h2 className="text-base font-bold mb-1">착샷 인물 스펙</h2>
            <p className="text-xs text-gray-400 mb-3">
              착샷에 찍힌 사람의 체형 — 예: 171/71
            </p>
            <input
              type="text"
              value={sourceSpecs}
              onChange={(e) => setSourceSpecs(e.target.value)}
              placeholder="171/71"
              className="w-full border rounded-xl px-4 py-3 text-sm"
            />
          </div>

          {/* 출력 비율 */}
          <div className="border rounded-2xl p-6 bg-white">
            <h2 className="text-base font-bold mb-1">출력 비율</h2>
            <p className="text-xs text-gray-400 mb-3">전체 샷에 일괄 적용 · 화질은 2K 고정</p>
            <div className="flex gap-2 flex-wrap">
              {ASPECT_RATIO_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAspectRatio(opt.value)}
                  className={`px-3 py-2 rounded-xl text-xs border transition ${
                    aspectRatio === opt.value
                      ? "bg-black text-white border-black"
                      : "border-gray-300 text-gray-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 샷 선택 */}
          <div className="border rounded-2xl p-6 bg-white space-y-5">
            <div>
              <h2 className="text-base font-bold mb-3">전신</h2>
              <div className="grid grid-cols-2 gap-3">
                {FULL_BODY_SHOTS.map(({ value, label }) =>
                  renderShotButton(value, label)
                )}
              </div>
            </div>
            <div>
              <h2 className="text-base font-bold mb-3">디테일</h2>
              <div className="grid grid-cols-2 gap-3">
                {DETAIL_SHOTS.map(({ value, label }) =>
                  renderShotButton(value, label)
                )}
              </div>
            </div>
          </div>

          {/* 생성 버튼 */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating.size > 0 || outfitItems.length === 0}
            className="w-full py-4 rounded-2xl bg-black text-white font-bold text-sm disabled:opacity-40"
          >
            {generating.size > 0 ? `생성 중... (${generating.size}장 남음)` : "생성"}
          </button>

          {/* 결과 */}
          {(results.length > 0 || generating.size > 0) && (
            <div className="border rounded-2xl p-6 bg-white">
              <h2 className="text-base font-bold mb-4">생성 결과</h2>
              <div className="grid grid-cols-2 gap-4">
                {/* 생성 중인 샷 플레이스홀더 */}
                {Array.from(generating).map((shot) => (
                  <div key={`loading-${shot}`} className="border rounded-xl overflow-hidden">
                    <div className="h-64 flex flex-col items-center justify-center gap-2 bg-gray-50">
                      <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-gray-400">{SHOT_LABELS[shot]} 생성 중</span>
                    </div>
                  </div>
                ))}
                {/* 완료된 결과 */}
                {results.map((result, index) => {
                  const { shot, url, retouchedUrl, retouchOpen } = result;
                  const displayUrl = retouchedUrl
                    ? `data:image/png;base64,${retouchedUrl}`
                    : url;
                  return (
                    <div key={shot} className="border rounded-xl overflow-hidden">
                      {displayUrl ? (
                        <>
                          <img
                            src={displayUrl}
                            alt={SHOT_LABELS[shot]}
                            className="w-full object-cover"
                          />
                          <div className="p-3 flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">
                              {SHOT_LABELS[shot]}
                            </span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setResults((prev) =>
                                    prev.map((s, i) =>
                                      i === index
                                        ? { ...s, retouchOpen: !s.retouchOpen }
                                        : s
                                    )
                                  )
                                }
                                className="text-xs px-3 py-1 border rounded-lg"
                              >
                                리터치
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownload(displayUrl, shot)}
                                className="text-xs px-3 py-1 border rounded-lg"
                              >
                                다운로드
                              </button>
                            </div>
                          </div>
                          {retouchOpen && (
                            <RetouchPanel
                              imageBase64={
                                retouchedUrl ?? stripDataUrlPrefix(url ?? "")
                              }
                              onRetouched={(newBase64) =>
                                setResults((prev) =>
                                  prev.map((s, i) =>
                                    i === index
                                      ? {
                                          ...s,
                                          retouchedUrl: newBase64,
                                          retouchOpen: false,
                                        }
                                      : s
                                  )
                                )
                              }
                              onClose={() =>
                                setResults((prev) =>
                                  prev.map((s, i) =>
                                    i === index ? { ...s, retouchOpen: false } : s
                                  )
                                )
                              }
                            />
                          )}
                        </>
                      ) : (
                        <div className="h-40 flex flex-col items-center justify-center gap-1 text-sm text-gray-400">
                          <span>생성 실패</span>
                          {errors[shot] && (
                            <span className="text-xs text-red-400 px-3 text-center">{errors[shot]}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
