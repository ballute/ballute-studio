"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { makeSessionId, uploadTempAssets } from "@/lib/storage";
import {
  clearPersistedGenerationBatch,
  persistGenerationBatch,
  releaseGenerationBatch,
  releasePersistedGenerationBatch,
  releaseGenerationBatchWithOptions,
  waitForGenerationBatch,
} from "@/lib/generation-batch";
import { getAccessToken } from "@/lib/supabase";
import FaceInputSection, {
  ModelGenerateOptions,
} from "@/components/face-input-section";

type OutputRatio = "4:5" | "2:3" | "16:9";

type UploadItem = {
  file: File;
  preview: string;
  caption?: string;
  storagePath?: string;
  uploaded?: boolean;
  expiresAt?: string;
};

type RefRunDirection = {
  background: string;
  pose: string;
  expression: string;
  camera_angle_and_crop: string;
  lighting_and_exposure: string;
  color_grading_and_texture: string;
  overall_mood: string;
};

type RefRunResult = {
  image: string;
  summary: string;
  elapsedMs?: number;
  direction: RefRunDirection;
};

type ResultSlot = {
  status: "waiting" | "generating" | "done" | "error";
  result: RefRunResult | null;
  error?: string;
  referenceIndex: number;
  cutIndex: number;
};

type UploadSectionProps = {
  title: string;
  required?: boolean;
  description: string;
  items: UploadItem[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveItem: (index: number) => void;
  onClearAll: () => void;
  showCaptionInput?: boolean;
  onCaptionChange?: (index: number, value: string) => void;
};

function UploadSection({
  title,
  required = false,
  description,
  items,
  onAddFiles,
  onRemoveItem,
  onClearAll,
  showCaptionInput = false,
  onCaptionChange,
}: UploadSectionProps) {
  return (
    <div className="border rounded-2xl p-6 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-xl font-bold">{title}</h2>
        {required ? (
          <span className="text-xs px-2 py-1 rounded-full bg-black text-white">
            필수
          </span>
        ) : (
          <span className="text-xs px-2 py-1 rounded-full border text-gray-600">
            선택
          </span>
        )}
      </div>

      <p className="text-sm text-gray-700 mb-4 leading-6">{description}</p>

      <div className="flex gap-3 mb-4">
        <label className="block cursor-pointer">
          <div className="px-4 py-3 border-2 border-dashed rounded-xl text-sm text-gray-500">
            여러 장 추가 업로드
          </div>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onAddFiles(e.target.files)}
          />
        </label>

        <button
          type="button"
          onClick={onClearAll}
          className="px-4 py-3 border rounded-xl text-sm text-gray-700"
        >
          전체 삭제
        </button>
      </div>

      <div className="mt-2 text-sm text-gray-600">
        현재 업로드 수: <b>{items.length}장</b>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
          {items.map((item, index) => (
            <div
              key={`${item.file.name}-${index}`}
              className="border rounded-xl p-2"
            >
              <img
                src={item.preview}
                alt={item.file.name}
                className="w-full h-32 object-cover rounded-lg"
              />
              <div className="mt-2 text-xs text-gray-600 truncate">
                {item.file.name}
              </div>

              {item.uploaded ? (
                <div className="mt-2 text-[11px] text-green-600">
                  temp 업로드 완료
                </div>
              ) : null}

              {showCaptionInput && onCaptionChange ? (
                <textarea
                  value={item.caption || ""}
                  onChange={(e) => onCaptionChange(index, e.target.value)}
                  placeholder="예: untucked / unbuttoned / layered under jacket"
                  className="mt-2 w-full border rounded-lg px-2 py-2 text-xs"
                  rows={3}
                />
              ) : null}

              <button
                type="button"
                onClick={() => onRemoveItem(index)}
                className="mt-2 w-full bg-red-500 text-white text-xs py-2 rounded-lg"
              >
                이 사진 삭제
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 text-sm text-gray-400">아직 업로드 안 됨</div>
      )}
    </div>
  );
}

function ShortTag({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs bg-[#fafaf8]">
      <span className="font-semibold text-gray-800">{label}</span>
      <span className="text-gray-600 truncate max-w-[180px]">{value}</span>
    </div>
  );
}

function shorten(text?: string, max = 42) {
  if (!text) return "-";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function getImageMime(base64?: string) {
  if (!base64) return "image/jpeg";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  return "image/jpeg";
}

function parseJsonSafely(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function RefRunPage() {
  const router = useRouter();

  const [faces, setFaces] = useState<UploadItem[]>([]);
  const [outfits, setOutfits] = useState<UploadItem[]>([]);
  const [references, setReferences] = useState<UploadItem[]>([]);

  const [outfitMode, setOutfitMode] = useState<"outfit" | "mix">("outfit");
  const [fitSpec, setFitSpec] = useState("");
  const [shootingMode, setShootingMode] = useState("default");
  const [customPrompt, setCustomPrompt] = useState("");
  const [outputRatio, setOutputRatio] = useState<OutputRatio>("4:5");
  const [perReferenceCount, setPerReferenceCount] = useState(2);

  const [loading, setLoading] = useState(false);
  const [modelGenerating, setModelGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [resultSlots, setResultSlots] = useState<ResultSlot[]>([]);
  const [refRunSessionId, setRefRunSessionId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const batchAccessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initializeSession = async () => {
      await releasePersistedGenerationBatch("refrun");

      if (cancelled) {
        return;
      }

      setRefRunSessionId(makeSessionId("refrun"));
      setSessionReady(true);
    };

    void initializeSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loading || !refRunSessionId || !batchAccessTokenRef.current) {
      return;
    }

    const releaseCurrentBatch = () => {
      if (!batchAccessTokenRef.current) {
        return;
      }

      void releaseGenerationBatchWithOptions(refRunSessionId, {
        accessToken: batchAccessTokenRef.current,
        keepalive: true,
      });
    };

    window.addEventListener("beforeunload", releaseCurrentBatch);

    return () => {
      window.removeEventListener("beforeunload", releaseCurrentBatch);
      releaseCurrentBatch();
    };
  }, [loading, refRunSessionId]);

  const modelGenerationCost = 30;
  const refrunCostPerImage = 50;
  const safeCount = Math.max(1, Math.min(20, Number(perReferenceCount) || 1));
  const totalResults = references.length * safeCount;
  const totalCost = totalResults * refrunCostPerImage;

  const handlePointFailure = (message: string) => {
    setStatusMessage(`오류: ${message}`);

    if (message.includes("로그인이 필요합니다")) {
      alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
      router.push("/login");
      return true;
    }

    if (message.includes("포인트 부족")) {
      alert("포인트가 부족합니다. 충전 페이지로 이동합니다.");
      router.push("/charge");
      return true;
    }

    alert(message);
    return false;
  };

  const isBlockingGenerationError = (status: number, message: string) => {
    return (
      status === 401 ||
      status === 402 ||
      status === 403 ||
      message.includes("로그인이 필요합니다") ||
      message.includes("포인트 부족")
    );
  };

  const getAuthHeaders = async (headers?: HeadersInit) => {
    const accessToken = await getAccessToken();
    batchAccessTokenRef.current = accessToken;

    const nextHeaders = new Headers(headers);
    nextHeaders.set("Authorization", `Bearer ${accessToken}`);

    return nextHeaders;
  };

  const appendFiles = (
    setter: React.Dispatch<React.SetStateAction<UploadItem[]>>,
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;

    const MAX_SIZE = 10 * 1024 * 1024;
    const newItems: UploadItem[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) {
        alert("이미지는 10MB 이하만 업로드할 수 있습니다.");
        return;
      }

      newItems.push({
        file,
        preview: URL.createObjectURL(file),
        caption: "",
      });
    }

    setter((prev) => [...prev, ...newItems]);
  };

  const removeItem = (
    setter: React.Dispatch<React.SetStateAction<UploadItem[]>>,
    index: number
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAll = (
    setter: React.Dispatch<React.SetStateAction<UploadItem[]>>
  ) => {
    setter([]);
  };

  const updateOutfitCaption = (index: number, value: string) => {
    setOutfits((prev) =>
      prev.map((item, i) => (i === index ? { ...item, caption: value } : item))
    );
  };

  const updateSlot = (index: number, patch: Partial<ResultSlot>) => {
    setResultSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot))
    );
  };

  const uploadItemsToStorage = async (
    items: UploadItem[],
    kind: "faces" | "outfits" | "references"
  ) => {
    const currentSessionId = refRunSessionId;

    if (!currentSessionId) {
      throw new Error("세션 생성중입니다. 잠시 후 다시 시도해 주세요.");
    }

    const pending = items.filter((item) => !item.uploaded || !item.storagePath);

    if (!pending.length) {
      return items;
    }

    const uploaded = await uploadTempAssets({
      files: pending.map((item) => item.file),
      kind,
      sessionId: currentSessionId,
    });

    let uploadIndex = 0;

    return items.map((item) => {
      if (item.uploaded && item.storagePath) {
        return item;
      }

      const asset = uploaded[uploadIndex++];

      return {
        ...item,
        storagePath: asset.path,
        uploaded: true,
        expiresAt: asset.expiresAt,
      };
    });
  };

  const ensureAssetsUploaded = async () => {
    setStatusMessage("임시 스토리지 업로드중...");

    const uploadedFaces = await uploadItemsToStorage(faces, "faces");
    setFaces(uploadedFaces);

    const uploadedOutfits = await uploadItemsToStorage(outfits, "outfits");
    setOutfits(uploadedOutfits);

    const uploadedReferences = await uploadItemsToStorage(
      references,
      "references"
    );
    setReferences(uploadedReferences);

    return {
      uploadedFaces,
      uploadedOutfits,
      uploadedReferences,
    };
  };

  const cleanupRefRunSession = async () => {
    try {
      const { supabase } = await import("@/lib/supabase");

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        console.warn("세션 토큰이 없어 temp 즉시 삭제를 건너뜁니다.");
        return;
      }

      const res = await fetch("/api/temp-assets/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          sessionId: refRunSessionId,
        }),
      });

      const raw = await res.text();
      const data = parseJsonSafely(raw);

      if (!res.ok) {
        throw new Error(data?.error || raw || "임시 파일 삭제 실패");
      }
    } catch (error) {
      console.error("REFRUN_SESSION_CLEANUP_ERROR:", error);
    }
  };

  const resetUploadedStorageState = () => {
    setFaces((prev) =>
      prev.map((item) => ({
        ...item,
        storagePath: undefined,
        uploaded: false,
        expiresAt: undefined,
      }))
    );

    setOutfits((prev) =>
      prev.map((item) => ({
        ...item,
        storagePath: undefined,
        uploaded: false,
        expiresAt: undefined,
      }))
    );

    setReferences((prev) =>
      prev.map((item) => ({
        ...item,
        storagePath: undefined,
        uploaded: false,
        expiresAt: undefined,
      }))
    );
  };

  const handleGenerateModel = async (options: ModelGenerateOptions) => {
    try {
      setModelGenerating(true);
      setStatusMessage("모델 생성 요청 준비중...");

      const accessToken = await getAccessToken();
      batchAccessTokenRef.current = accessToken;
      setStatusMessage("모델 생성중...");

      const res = await fetch("/api/model-anchor", {
        method: "POST",
        headers: await getAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(options),
      });

      const raw = await res.text();
      const data = parseJsonSafely(raw);

      if (!res.ok) {
        throw new Error(data?.error || raw || "모델 생성 실패");
      }

      if (!data?.imageBase64) {
        throw new Error("모델 생성 응답이 비어 있습니다.");
      }

      const mimeType = data.mimeType || getImageMime(data.imageBase64);
      const extension = mimeType === "image/png" ? "png" : "jpg";

      const blob = await fetch(
        `data:${mimeType};base64,${data.imageBase64}`
      ).then((r) => r.blob());

      const file = new File([blob], `model-anchor-${Date.now()}.${extension}`, {
        type: mimeType,
      });

      const newItem: UploadItem = {
        file,
        preview: URL.createObjectURL(file),
      };

      setFaces((prev) => [...prev, newItem]);
      setStatusMessage(`모델 생성 완료 (${modelGenerationCost}P 차감)`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "모델 생성 중 오류";
      handlePointFailure(message);
    } finally {
      setModelGenerating(false);
    }
  };

  const handleRunRefRun = async () => {
    if (!sessionReady || !refRunSessionId) {
      alert("세션 생성중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const batchId = refRunSessionId;

    if (faces.length === 0 || outfits.length === 0 || references.length === 0) {
      alert("얼굴 / 의상 / 레퍼런스는 최소 1장씩 필요하다.");
      return;
    }

    if (outfitMode === "mix") {
      const hasEmptyCaption = outfits.some(
        (item) => !(item.caption || "").trim()
      );
      if (hasEmptyCaption) {
        alert("MIX 모드에서는 모든 아이템에 설명을 입력해야 한다.");
        return;
      }
    }

    try {
      persistGenerationBatch("refrun", batchId);
      setLoading(true);

      const accessToken = await getAccessToken();
      batchAccessTokenRef.current = accessToken;

      await waitForGenerationBatch({
        batchId,
        mode: "refrun",
        accessToken,
        onQueued: (position) => {
          setStatusMessage(
            `현재 작업량이 많아 대기 중입니다. 대기 순번 ${position}번. 이 탭을 닫거나 다른 페이지로 이동하지 말아 주세요.`
          );
        },
        onActive: () => {
          setStatusMessage("대기가 끝나 작업을 시작합니다.");
        },
      });

      const { uploadedFaces, uploadedOutfits, uploadedReferences } =
        await ensureAssetsUploaded();

      const facePaths = uploadedFaces
        .map((item) => item.storagePath)
        .filter((v): v is string => Boolean(v));

      const outfitPaths = uploadedOutfits
        .map((item) => item.storagePath)
        .filter((v): v is string => Boolean(v));

      const referencePaths = uploadedReferences
        .map((item) => item.storagePath)
        .filter((v): v is string => Boolean(v));

      if (!facePaths.length || !outfitPaths.length || !referencePaths.length) {
        throw new Error("얼굴 / 의상 / 레퍼런스 업로드 경로 확보 실패");
      }

      const initialSlots: ResultSlot[] = [];
      for (let refIndex = 0; refIndex < referencePaths.length; refIndex++) {
        for (let cutIndex = 0; cutIndex < safeCount; cutIndex++) {
          initialSlots.push({
            status: "waiting",
            result: null,
            referenceIndex: refIndex,
            cutIndex,
          });
        }
      }
      setResultSlots(initialSlots);

      setStatusMessage("REFRUN 생성 시작...");

      let successCount = 0;
      let chargedPoints = 0;
      let stopMessage = "";
      let stoppedByChargeFailure = false;

      outerLoop: for (
        let refIndex = 0;
        refIndex < referencePaths.length;
        refIndex++
      ) {
        const referencePath = referencePaths[refIndex];

        for (let cutIndex = 0; cutIndex < safeCount; cutIndex++) {
          const slotIndex = refIndex * safeCount + cutIndex;
          updateSlot(slotIndex, { status: "generating" });

          try {
            const res = await fetch("/api/refrun/run-one", {
              method: "POST",
              headers: await getAuthHeaders({
                "Content-Type": "application/json",
              }),
              body: JSON.stringify({
                batchId,
                fitSpec,
                shootingMode,
                customPrompt,
                outfitMode,
                mixCaptions: uploadedOutfits.map((item) => item.caption || ""),
                facePaths,
                outfitPaths,
                referencePath,
                outputRatio,
              }),
            });

            const raw = await res.text();
            const data = parseJsonSafely(raw);

            if (!res.ok) {
              const message =
                data?.error || raw || "REFRUN 한 장 생성 실패";

              if (isBlockingGenerationError(res.status, message)) {
                stoppedByChargeFailure = true;
                stopMessage = message.includes("포인트 부족")
                  ? "포인트 부족으로 추가 생성을 중단했습니다."
                  : message;

                updateSlot(slotIndex, {
                  status: "error",
                  error: message,
                });

                handlePointFailure(message);
                break outerLoop;
              }

              throw new Error(message);
            }

            updateSlot(slotIndex, {
              status: "done",
              result: data.result as RefRunResult,
            });

            successCount += 1;
            chargedPoints += refrunCostPerImage;
            setStatusMessage(
              `Ref ${refIndex + 1} / Cut ${cutIndex + 1} 생성 완료 (${refrunCostPerImage}P 차감)`
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "알 수 없는 REFRUN 오류";

            updateSlot(slotIndex, {
              status: "error",
              error: message,
            });

            setStatusMessage(
              `Ref ${refIndex + 1} / Cut ${cutIndex + 1} 오류`
            );
          }
        }
      }

      if (stoppedByChargeFailure) {
        setResultSlots((prev) =>
          prev.map((slot) =>
            slot.status === "waiting"
              ? {
                  ...slot,
                  status: "error",
                  error: stopMessage,
                }
              : slot
          )
        );
      }

      setStatusMessage("임시 파일 정리중...");
      await cleanupRefRunSession();
      resetUploadedStorageState();
      setStatusMessage(
        `${
          stoppedByChargeFailure ? "REFRUN 중단" : "REFRUN 완료"
        } · 성공 ${successCount}장 · ${chargedPoints}P 차감`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "알 수 없는 REFRUN 오류";
      handlePointFailure(message);
    } finally {
      await releaseGenerationBatch(batchId);
      clearPersistedGenerationBatch("refrun", batchId);
      batchAccessTokenRef.current = null;
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-gray-600 mb-4"
          >
            ← 홈으로
          </Link>

          <h1 className="text-4xl font-bold mb-3">REFRUN</h1>
          <p className="text-gray-700 text-lg leading-8 max-w-4xl">
            레퍼런스 이미지의 구도, 무드, 사진 문법을 분석해서 그대로 따라가는
            생산 라인.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
          <FaceInputSection
            items={faces}
            onAddFiles={(files) => appendFiles(setFaces, files)}
            onRemoveItem={(index) => removeItem(setFaces, index)}
            onClearAll={() => clearAll(setFaces)}
            onGenerate={handleGenerateModel}
            generating={modelGenerating}
            disabled={loading}
          />

          <div className="space-y-4">
            <div className="border rounded-2xl p-4 bg-white">
              <div className="font-semibold mb-3">의상 입력 방식</div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setOutfitMode("outfit")}
                  className={`px-4 py-2 rounded-xl border ${
                    outfitMode === "outfit"
                      ? "bg-black text-white"
                      : "bg-white text-gray-700"
                  }`}
                >
                  OUTFIT
                </button>
                <button
                  type="button"
                  onClick={() => setOutfitMode("mix")}
                  className={`px-4 py-2 rounded-xl border ${
                    outfitMode === "mix"
                      ? "bg-black text-white"
                      : "bg-white text-gray-700"
                  }`}
                >
                  MIX
                </button>
              </div>
            </div>

            <UploadSection
              title={outfitMode === "mix" ? "MIX 아이템 업로드" : "의상 착샷 업로드"}
              required
              description={
                outfitMode === "mix"
                  ? "아이템 여러 장을 조립하는 모드. 각 이미지마다 설명을 꼭 입력해야 한다."
                  : "의상 재구성 기준 이미지. 정면/측면/디테일 등 여러 장 넣을 수 있다."
              }
              items={outfits}
              onAddFiles={(files) => appendFiles(setOutfits, files)}
              onRemoveItem={(index) => removeItem(setOutfits, index)}
              onClearAll={() => clearAll(setOutfits)}
              showCaptionInput={outfitMode === "mix"}
              onCaptionChange={updateOutfitCaption}
            />
          </div>

          <UploadSection
            title="레퍼런스 업로드"
            required
            description="구도, 무드, 사진 문법을 따라갈 기준 레퍼런스 이미지."
            items={references}
            onAddFiles={(files) => appendFiles(setReferences, files)}
            onRemoveItem={(index) => removeItem(setReferences, index)}
            onClearAll={() => clearAll(setReferences)}
          />
        </div>

        <div className="border rounded-2xl p-6 bg-white space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">
                Reference당 생성 수
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={perReferenceCount}
                onChange={(e) => setPerReferenceCount(Number(e.target.value))}
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                핏 보정 (기존 모델 스펙 → AI 모델 스펙)
              </label>
              <input
                type="text"
                value={fitSpec}
                onChange={(e) => setFitSpec(e.target.value)}
                placeholder="예: 173/71 → 183/63"
                className="w-full border rounded-xl px-4 py-3"
              />
              <div className="mt-2 text-xs text-gray-500 leading-5">
                베타 서비스 단계 · 미입력 시 기존 핏과 유사하게 맞춰드립니다.
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Shooting Mode
              </label>
              <select
                value={shootingMode}
                onChange={(e) => setShootingMode(e.target.value)}
                className="w-full border rounded-xl px-4 py-3"
              >
                <option value="default">default</option>
                <option value="fuji">fuji</option>
                <option value="mono">mono</option>
                <option value="studio">studio</option>
                <option value="raw">raw</option>
                <option value="custom">custom</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Output Ratio
              </label>
              <select
                value={outputRatio}
                onChange={(e) => setOutputRatio(e.target.value as OutputRatio)}
                className="w-full border rounded-xl px-4 py-3"
              >
                <option value="4:5">4:5</option>
                <option value="2:3">2:3</option>
                <option value="16:9">16:9</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Custom Prompt
              </label>
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="shootingMode가 custom일 때만 사용"
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>
          </div>

          <div className="border rounded-xl p-4 bg-[#fafaf8]">
            <div className="font-semibold mb-2">현재 설정 요약</div>
            <div className="text-sm text-gray-700 space-y-1">
              <div>얼굴: {faces.length}장</div>
              <div>의상: {outfits.length}장</div>
              <div>레퍼런스: {references.length}장</div>
              <div>의상 모드: {outfitMode}</div>
              <div>Reference당 생성 수: {safeCount}</div>
              <div>총 예상 결과 수: {totalResults}장</div>
              <div>핏 보정: {fitSpec || "없음"}</div>
              <div>Shooting Mode: {shootingMode}</div>
              <div>Output Ratio: {outputRatio}</div>
              <div>차감 방식: 성공 결과당 {refrunCostPerImage}P</div>
              <div>최대 차감 비용: {totalCost}P</div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-black">포인트 충전</div>
                <div className="mt-1 text-sm text-gray-600">
                  성공한 결과만 장당 차감되지만, 최대 비용 기준으로 잔액 확인을 권장합니다.
                </div>
              </div>

              <Link
                href="/charge"
                className="inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-medium transition hover:bg-[#f3f3f1]"
              >
                충전하러 가기
              </Link>
            </div>
          </div>

          <button
            onClick={handleRunRefRun}
            disabled={loading || modelGenerating || !refRunSessionId}
            className="w-full bg-black text-white py-5 rounded-2xl text-xl disabled:opacity-60"
          >
            {loading ? "REFRUN 준비중..." : `REFRUN 실행하기 (최대 ${totalCost}P)`}
          </button>
        </div>

        <div className="mt-6 border rounded-2xl p-5 bg-white">
          <div className="font-semibold mb-2">상태</div>
          <div className="text-sm text-gray-700">
            {statusMessage || "아직 실행 전"}
          </div>
        </div>

        {resultSlots.length > 0 ? (
          <div className="mt-8 space-y-6">
            <h2 className="text-2xl font-bold">REFRUN 결과</h2>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {resultSlots.map((slot, index) => (
                <div key={index} className="border rounded-2xl p-5 bg-white">
                  <div className="font-semibold mb-3">
                    Ref {slot.referenceIndex + 1} / Cut {slot.cutIndex + 1}
                  </div>

                  {slot.status === "waiting" && (
                    <div className="border rounded-xl h-96 flex items-center justify-center text-gray-400">
                      대기중...
                    </div>
                  )}

                  {slot.status === "generating" && (
                    <div className="border rounded-xl h-96 flex items-center justify-center text-gray-400">
                      생성중...
                    </div>
                  )}

                  {slot.status === "error" && (
                    <div className="border rounded-xl h-96 flex items-center justify-center text-red-500 text-sm px-4 text-center">
                      오류: {slot.error}
                    </div>
                  )}

                  {slot.status === "done" && slot.result && (
                    <>
                      <img
                        src={`data:${getImageMime(slot.result.image)};base64,${slot.result.image}`}
                        alt={`refrun-result-${index}`}
                        className="w-full rounded-xl border mb-4"
                      />

                      <div className="flex flex-wrap gap-2 mb-4">
                        <ShortTag
                          label="배경"
                          value={shorten(slot.result.direction.background)}
                        />
                        <ShortTag
                          label="포즈"
                          value={shorten(slot.result.direction.pose)}
                        />
                        <ShortTag
                          label="표정"
                          value={shorten(slot.result.direction.expression)}
                        />
                        <ShortTag
                          label="카메라"
                          value={shorten(
                            slot.result.direction.camera_angle_and_crop
                          )}
                        />
                        <ShortTag
                          label="조명"
                          value={shorten(
                            slot.result.direction.lighting_and_exposure
                          )}
                        />
                        <ShortTag
                          label="무드"
                          value={shorten(slot.result.direction.overall_mood)}
                        />
                      </div>

                      <div className="text-sm text-gray-700">
                        <b>요약:</b> {slot.result.summary}
                        {typeof slot.result.elapsedMs === "number" && (
                          <>
                            <br />
                            <b>생성 시간:</b>{" "}
                            {(slot.result.elapsedMs / 1000).toFixed(1)}초
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
