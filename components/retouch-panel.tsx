"use client";

import { useState, useRef } from "react";
import { getAccessToken } from "@/lib/supabase";

type RetouchTab = "style" | "garment" | "expression" | "mood";
type GarmentType = "top" | "bottom";

interface RetouchPanelProps {
  imageBase64: string;
  onRetouched: (newBase64: string) => void;
  onClose: () => void;
}

export function RetouchPanel({ imageBase64, onRetouched, onClose }: RetouchPanelProps) {
  const [tab, setTab] = useState<RetouchTab>("style");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // style
  const [instruction, setInstruction] = useState("");
  const [intensity, setIntensity] = useState(50);

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

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File | null) => void,
    setBase64: (b: string) => void
  ) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const result = (reader.result as string).split(",")[1];
      setBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const apply = async () => {
    setError("");
    setLoading(true);
    try {
      let body: Record<string, unknown> = { imageBase64 };

      if (tab === "style") {
        if (!instruction.trim()) { setError("Enter an edit instruction."); setLoading(false); return; }
        body = { ...body, type: "general", instruction, intensity };
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

      const data = await res.json();
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
          <div>
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
          <div>
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
