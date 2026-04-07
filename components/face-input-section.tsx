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
  const [mode, setMode] = useState<"generate" | "upload">("upload");

  const [ethnicity, setEthnicity] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [hairStyle, setHairStyle] = useState("");
  const [skinTone, setSkinTone] = useState("");
  const [eyeColor, setEyeColor] = useState("");
  const [mood, setMood] = useState("");
  const [extraDetails, setExtraDetails] = useState("");

  const handleGenerateClick = () => {
    onGenerate({
      ethnicity: ethnicity.trim() || "East Asian",
      gender: gender.trim() || "Male",
      age: age.trim() || "Early 20s",
      hairStyle: hairStyle.trim() || "Short black hair",
      skinTone: skinTone.trim() || "Light neutral skin tone",
      eyeColor: eyeColor.trim() || "Dark brown",
      mood: mood.trim() || "Calm and confident",
      extraDetails,
    });
  };

  const inputClass =
    "w-full border-b border-black/70 bg-transparent px-0 py-2 text-[15px] outline-none placeholder:text-gray-400";
  const labelClass =
    "mb-1 text-[12px] font-semibold uppercase tracking-[0.03em] text-gray-500";

  return (
    <div className="border rounded-2xl p-6 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-xl font-bold">모델 얼굴 입력</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-black text-white">
          필수
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-4 leading-6">
        기존 모델 이미지를 업로드하거나, 원하는 조건을 입력해서 가상 모델 얼굴
        앵커를 생성할 수 있다.
      </p>

      <div className="mb-5 flex rounded-full border border-black/40 p-1">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold transition ${
            mode === "upload"
              ? "bg-black text-white"
              : "bg-white text-black hover:bg-gray-50"
          }`}
        >
          UPLOAD EXISTING MODEL
        </button>
        <button
          type="button"
          onClick={() => setMode("generate")}
          className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold transition ${
            mode === "generate"
              ? "bg-black text-white"
              : "bg-white text-black hover:bg-gray-50"
          }`}
        >
          GENERATE VIRTUAL MODEL
        </button>
      </div>

      {mode === "upload" ? (
        <div>
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
                disabled={disabled}
              />
            </label>

            <button
              type="button"
              onClick={onClearAll}
              className="px-4 py-3 border rounded-xl text-sm text-gray-700"
              disabled={disabled}
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

                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    className="mt-2 w-full bg-red-500 text-white text-xs py-2 rounded-lg"
                    disabled={disabled}
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
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5">
            <div>
              <div className={labelClass}>ETHNICITY</div>
              <input
                type="text"
                value={ethnicity}
                onChange={(e) => setEthnicity(e.target.value)}
                placeholder="East Asian / Japanese / Korean"
                className={inputClass}
              />
            </div>

            <div>
              <div className={labelClass}>GENDER</div>
              <input
                type="text"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                placeholder="Male"
                className={inputClass}
              />
            </div>

            <div>
              <div className={labelClass}>AGE</div>
              <input
                type="text"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Early 20s"
                className={inputClass}
              />
            </div>

            <div>
              <div className={labelClass}>SKIN TONE</div>
              <input
                type="text"
                value={skinTone}
                onChange={(e) => setSkinTone(e.target.value)}
                placeholder="Light neutral skin tone"
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <div className={labelClass}>HAIR STYLE</div>
              <input
                type="text"
                value={hairStyle}
                onChange={(e) => setHairStyle(e.target.value)}
                placeholder="Short messy black hair, city boy style"
                className={inputClass}
              />
            </div>

            <div>
              <div className={labelClass}>EYE COLOR</div>
              <input
                type="text"
                value={eyeColor}
                onChange={(e) => setEyeColor(e.target.value)}
                placeholder="Dark brown"
                className={inputClass}
              />
            </div>

            <div>
              <div className={labelClass}>MOOD</div>
              <input
                type="text"
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                placeholder="Calm and confident"
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <div className={labelClass}>ETC</div>
              <textarea
                value={extraDetails}
                onChange={(e) => setExtraDetails(e.target.value)}
                placeholder="soft straight brows, clean jawline, no facial hair, natural lips, balanced symmetry"
                className="w-full border-b border-black/70 bg-transparent px-0 py-2 text-[15px] outline-none placeholder:text-gray-400 resize-none"
                rows={3}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerateClick}
            disabled={generating || disabled}
            className="inline-flex rounded-2xl bg-black px-6 py-4 text-lg text-white disabled:opacity-60"
          >
            {generating ? "모델 생성중..." : "모델 생성 (성공 시 30P)"}
          </button>
        </div>
      )}
    </div>
  );
}
