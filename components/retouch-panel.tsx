"use client";

import { useState, useRef } from "react";
import { getAccessToken } from "@/lib/supabase";
import { useDropPaste } from "@/lib/use-drop-paste";

type RetouchTab = "style" | "garment" | "expression" | "mood";
type GarmentType = "top" | "bottom";

interface RetouchPanelProps {
  imageBase64: string;
  onRetouched: (newBase64: string) => void;
  onClose: () => void;
}

/** base64 첫 몇 바이트로 이미지 mime 타입 감지 (png/jpeg/webp/gif) */
function detectMimeFromBase64(base64: string): string {
  const head = base64.slice(0, 16);
  if (head.startsWith("iVBORw0KGgo")) return "image/png";
  if (head.startsWith("/9j/")) return "image/jpeg";
  if (head.startsWith("UklGR")) return "image/webp";
  if (head.startsWith("R0lGOD")) return "image/gif";
  return "image/jpeg"; // 알 수 없으면 jpeg로 기본
}

/** base64 이미지가 maxBytes보다 크면 canvas로 리사이즈해서 줄인다 */
async function compressBase64(base64: string, maxBytes = 3_500_000): Promise<string> {
  // 이미 작으면 그대로 반환
  if (base64.length * 0.75 <= maxBytes) return base64;

  const mime = detectMimeFromBase64(base64);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // 긴 변 2048 이하로 축소
      const maxDim = 2048;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      // quality 0.85 JPEG로 출력 (압축률 좋음)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve(dataUrl.split(",")[1]);
    };
    img.src = `data:${mime};base64,${base64}`;
  });
}

export function RetouchPanel({ imageBase64, onRetouched, onClose }: RetouchPanelProps) {
  const [tab, setTab] = useState<RetouchTab>("style");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // style
  const [instruction, setInstruction] = useState("");
  const [intensity, setIntensity] = useState(50);
  const [styleFile, setStyleFile] = useState<File | null>(null);
  const [styleBase64, setStyleBase64] = useState<string>("");
  const styleInputRef = useRef<HTMLInputElement>(null);

  // garment
  const [garmentType, setGarmentType] = useState<GarmentType>("top");
  const [garmentInstruction, setGarmentInstruction] = useState("");
  const [garmentFile, setGarmentFile] = useState<File | null>(null);
  const [garmentBase64, setGarmentBase64] = useState<string>("");
  const garmentInputRef = useRef<HTMLInputElement>(null);

  // expression
  const [expressionInstruction, setExpressionInstruction] = useState("");

  // mood
  const [moodDescription, setMoodDescription] = useState("");
  const [moodFile, setMoodFile] = useState<File | null>(null);
  const [moodBase64, setMoodBase64] = useState<string>("");
  const moodInputRef = useRef<HTMLInputElement>(null);
  const [textureLevel, setTextureLevel] = useState(0);

  const applyFile = (
    file: File | null,
    setFile: (f: File | null) => void,
    setBase64: (b: string) => void
  ) => {
    if (!file) return;
    setFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const result = (reader.result as string).split(",")[1];
      setBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File | null) => void,
    setBase64: (b: string) => void
  ) => {
    applyFile(e.target.files?.[0] ?? null, setFile, setBase64);
  };

  // 레퍼런스 3종 각각 드래그&드롭 + Ctrl+V 지원
  const styleZone = useDropPaste((f) =>
    applyFile(f?.[0] ?? null, setStyleFile, setStyleBase64)
  );
  const garmentZone = useDropPaste((f) =>
    applyFile(f?.[0] ?? null, setGarmentFile, setGarmentBase64)
  );
  const moodZone = useDropPaste((f) =>
    applyFile(f?.[0] ?? null, setMoodFile, setMoodBase64)
  );
  const zoneClass = (dragging: boolean) =>
    `outline-none rounded-lg ${dragging ? "ring-2 ring-black/30" : ""}`;

  const apply = async () => {
    setError("");
    setLoading(true);
    try {
      const compressedImage = await compressBase64(imageBase64);
      let body: Record<string, unknown> = { imageBase64: compressedImage };

      if (tab === "style") {
        if (!instruction.trim() && !styleBase64) {
          setError("Enter an edit instruction or provide a style reference image."); setLoading(false); return;
        }
        const compressedStyleBase64 = styleBase64 ? await compressBase64(styleBase64) : "";
        body = {
          ...body,
          type: "general",
          instruction,
          intensity,
          styleReferenceBase64: compressedStyleBase64 || undefined,
        };
      } else if (tab === "garment") {
        if (!garmentInstruction.trim() && !garmentBase64) {
          setError("Provide a garment description or reference image."); setLoading(false); return;
        }
        body = {
          ...body,
          type: "garment",
          garmentType,
          instruction: garmentInstruction,
          garmentBase64: garmentBase64 || undefined,
        };
      } else if (tab === "expression") {
        if (!expressionInstruction.trim()) { setError("Enter an expression instruction."); setLoading(false); return; }
        body = { ...body, type: "expression", instruction: expressionInstruction };
      } else {
        if (!moodDescription.trim() && !moodBase64 && textureLevel === 0) {
          setError("Provide a mood description, reference image, or adjust texture."); setLoading(false); return;
        }
        body = {
          ...body,
          type: "mood",
          moodDescription,
          moodReferenceBase64: moodBase64 || undefined,
          textureLevel,
        };
      }

      const accessToken = await getAccessToken();
      const res = await fetch("/api/retouch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { throw new Error(raw.slice(0, 200) || "서버 응답 파싱 실패"); }
      if (!res.ok) throw new Error(data.error ?? "Retouch failed");
      onRetouched(data.result.image);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const tabs: { key: RetouchTab; label: string }[] = [
    { key: "style", label: "Style" },
    { key: "garment", label: "Garment" },
    { key: "expression", label: "Expression" },
    { key: "mood", label: "Mood" },
  ];

  return (
    <div className="mt-3 border rounded-xl p-4 bg-gray-50 space-y-4">
      {/* Tab */}
      <div className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setError(""); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-black text-white" : "bg-white border text-gray-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Style */}
      {tab === "style" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Free-form edit — describe any change you want applied to the image</p>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Make the background darker / Change shoes to white sneakers"
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-20"
          />
          <div {...styleZone.zoneProps} className={zoneClass(styleZone.dragging)}>
            <input
              ref={styleInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileUpload(e, setStyleFile, setStyleBase64)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => styleInputRef.current?.click()}
              className="w-full border-dashed border-2 rounded-lg py-3 text-sm text-gray-500 hover:border-gray-400 transition-colors"
            >
              {styleFile ? "✓ " + styleFile.name : "Style reference image (optional)"}
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Intensity</span>
              <span className="font-mono font-bold">{intensity}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full accent-black"
            />
          </div>
        </div>
      )}

      {/* Garment */}
      {tab === "garment" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["top", "bottom"] as GarmentType[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGarmentType(g)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  garmentType === g ? "bg-black text-white" : "bg-white text-gray-600"
                }`}
              >
                {g === "top" ? "Top" : "Bottom"}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={garmentInstruction}
            onChange={(e) => setGarmentInstruction(e.target.value)}
            placeholder="e.g. White oversized shirt / Navy wool trousers"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <div {...garmentZone.zoneProps} className={zoneClass(garmentZone.dragging)}>
            <input
              ref={garmentInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileUpload(e, setGarmentFile, setGarmentBase64)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => garmentInputRef.current?.click()}
              className="w-full border-dashed border-2 rounded-lg py-3 text-sm text-gray-500 hover:border-gray-400 transition-colors"
            >
              {garmentFile ? `✓ ${garmentFile.name}` : "Garment reference image (optional)"}
            </button>
          </div>
        </div>
      )}

      {/* Expression */}
      {tab === "expression" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Adjusts facial expression and gaze only — preserves identity and everything else</p>
          <input
            type="text"
            value={expressionInstruction}
            onChange={(e) => setExpressionInstruction(e.target.value)}
            placeholder="e.g. Slight smile / Eyes looking down"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* Mood */}
      {tab === "mood" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Transform the color grading, lighting atmosphere, and film quality — content stays the same</p>
          <textarea
            value={moodDescription}
            onChange={(e) => setMoodDescription(e.target.value)}
            placeholder="e.g. Warm golden hour film look / Cool muted overcast tone / Cinematic single-source light"
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-20"
          />
          <div {...moodZone.zoneProps} className={zoneClass(moodZone.dragging)}>
            <input
              ref={moodInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileUpload(e, setMoodFile, setMoodBase64)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => moodInputRef.current?.click()}
              className="w-full border-dashed border-2 rounded-lg py-3 text-sm text-gray-500 hover:border-gray-400 transition-colors"
            >
              {moodFile ? `✓ ${moodFile.name}` : "Mood reference image (optional)"}
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Film</span>
              <span className="font-mono font-bold">
                {textureLevel < -30 ? "Film" : textureLevel > 30 ? "Digital" : "Neutral"}
              </span>
              <span>Digital</span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              value={textureLevel}
              onChange={(e) => setTextureLevel(Number(e.target.value))}
              className="w-full accent-black"
            />
          </div>
        </div>
      )}

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={loading}
          className="flex-1 bg-black text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Processing..." : "Apply (30pt)"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-3 rounded-xl border text-sm text-gray-600"
        >
          Close
        </button>
      </div>
    </div>
  );
}
