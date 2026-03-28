"use client";

import { useState } from "react";

type FaceUploadItem = {
  file: File;
  preview: string;
};

export type ModelGenerateOptions = {
  ethnicity: string;
  gender: string;
  age: string;
  hairStyle: string;
  skinTone: string;
  eyeColor: string;
  mood: string;
  extraDetails: string;
};

type FaceInputSectionProps = {
  items: FaceUploadItem[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveItem: (index: number) => void;
  onClearAll: () => void;
  onGenerate: (options: ModelGenerateOptions) => void;
  generating: boolean;
  disabled?: boolean;
};

export default function FaceInputSection({
  items,
  onAddFiles,
  onRemoveItem,
  onClearAll,
  onGenerate,
  generating,
  disabled = false,
}: FaceInputSectionProps) {
  const [mode, setMode] = useState<"generate" | "upload">("generate");

  const [ethnicity, setEthnicity] = useState("East Asian");
  const [gender, setGender] = useState("Male");
  const [age, setAge] = useState("Early 20s");
  const [hairStyle, setHairStyle] = useState("Short messy black hair, city boy style");
  const [skinTone, setSkinTone] = useState("Light neutral skin tone");
  const [eyeColor, setEyeColor] = useState("Dark brown");
  const [mood, setMood] = useState("Calm and confident");
  const [extraDetails, setExtraDetails] = useState("");

  const handleGenerateClick = () => {
    onGenerate({
      ethnicity,
      gender,
      age,
      hairStyle,
      skinTone,
      eyeColor,
      mood,
      extraDetails,
    });
  };

  const inputClass =
    "w-full border-b border-black/70 bg-transparent px-0 py-3 text-[16px] outline-none placeholder:text-gray-400";
  const labelClass =
    "mb-2 text-[14px] font-semibold uppercase tracking-[0.02em] text-gray-500";

  return (
    <div className="border rounded-2xl p-6 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-xl font-bold">모델 얼굴 입력</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-black text-white">
          필수
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-5 leading-6">
        기존 모델 이미지를 업로드하거나, 원하는 조건을 입력해서 가상 모델 얼굴
        앵커를 생성할 수 있다.
      </p>

      <div className="mb-6 grid grid-cols-2 border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setMode("generate")}
          className={`px-4 py-4 text-sm font-semibold ${
            mode === "generate"
              ? "bg-black text-white"
              : "bg-white text-black"
          }`}
        >
          GENERATE VIRTUAL MODEL
        </button>

        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`px-4 py-4 text-sm font-semibold ${
            mode === "upload"
              ? "bg-black text-white"
              : "bg-white text-black"
          }`}
        >
          UPLOAD EXISTING MODEL
        </button>
      </div>

      {mode === "upload" ? (
        <div>
          <div className="flex flex-wrap gap-3 mb-4">
            <label className="block cursor-pointer">
              <div className="px-4 py-3 border-2 border-dashed rounded-xl text-sm text-gray-500 bg-white">
                여러 장 추가 업로드
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onAddFiles(e.target.files)}
                disabled={disabled || generating}
              />
            </label>

            <button
              type="button"
              onClick={onClearAll}
              disabled={disabled || generating}
              className="px-4 py-3 border rounded-xl text-sm text-gray-700 bg-white disabled:opacity-60"
            >
              전체 삭제
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-7">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-7">
            <div>
              <div className={labelClass}>ETHNICITY</div>
              <input
                value={ethnicity}
                onChange={(e) => setEthnicity(e.target.value)}
                className={inputClass}
                placeholder="East Asian"
              />
            </div>

            <div>
              <div className={labelClass}>GENDER</div>
              <input
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={inputClass}
                placeholder="Male / Female / Androgynous"
              />
            </div>

            <div>
              <div className={labelClass}>AGE</div>
              <input
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className={inputClass}
                placeholder="Early 20s"
              />
            </div>

            <div>
              <div className={labelClass}>SKIN TONE</div>
              <input
                value={skinTone}
                onChange={(e) => setSkinTone(e.target.value)}
                className={inputClass}
                placeholder="Light neutral skin tone"
              />
            </div>
          </div>

          <div>
            <div className={labelClass}>HAIR STYLE</div>
            <input
              value={hairStyle}
              onChange={(e) => setHairStyle(e.target.value)}
              className={inputClass}
              placeholder="Short messy black hair, city boy style"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-7">
            <div>
              <div className={labelClass}>EYE COLOR</div>
              <input
                value={eyeColor}
                onChange={(e) => setEyeColor(e.target.value)}
                className={inputClass}
                placeholder="Dark brown"
              />
            </div>

            <div>
              <div className={labelClass}>MOOD</div>
              <input
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                className={inputClass}
                placeholder="Calm and confident"
              />
            </div>
          </div>

          <div>
            <div className={labelClass}>ETC</div>
            <textarea
              value={extraDetails}
              onChange={(e) => setExtraDetails(e.target.value)}
              className="w-full border-b border-black/70 bg-transparent px-0 py-3 text-[16px] outline-none placeholder:text-gray-400 resize-none"
              rows={4}
              placeholder="예: soft straight brows, clean jawline, no facial hair, natural lips, balanced symmetry"
            />
          </div>

          <button
            type="button"
            onClick={handleGenerateClick}
            disabled={disabled || generating}
            className="px-5 py-3 rounded-xl bg-black text-white text-sm disabled:opacity-60"
          >
            {generating ? "모델 생성중..." : "모델 생성 (30P)"}
          </button>
        </div>
      )}

      <div className="mt-6 text-sm text-gray-600">
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