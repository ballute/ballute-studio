"use client";

import type { UploadItem } from "@/lib/types";
import { useDropPaste } from "@/lib/use-drop-paste";

type UploadSectionProps = {
  title: string;
  required?: boolean;
  description: string;
  items: UploadItem[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveItem: (index: number) => void;
  onClearAll: () => void;
  showCaptionInput?: boolean;
  captionPlaceholder?: string;
  onCaptionChange?: (index: number, value: string) => void;
};

export default function UploadSection({
  title,
  required = false,
  description,
  items,
  onAddFiles,
  onRemoveItem,
  onClearAll,
  showCaptionInput = false,
  captionPlaceholder = "예: untucked / unbuttoned / layered under jacket",
  onCaptionChange,
}: UploadSectionProps) {
  // 드래그&드롭 + (마우스 올린 채) Ctrl+V 붙여넣기 지원 — 카드 전체가 드롭존,
  // 하이라이트는 아래 전용 박스에 표시
  const { dragging, zoneProps } = useDropPaste(onAddFiles);

  return (
    <div {...zoneProps} className="border rounded-2xl p-6 bg-white">
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

      <div className="flex flex-wrap gap-3 mb-3">
        <label className="block cursor-pointer">
          <div className="px-4 py-3 border rounded-xl text-sm text-gray-700 hover:border-gray-400 transition">
            + 파일 업로드
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

      {/* 드래그/붙여넣기 전용 박스 — 클릭해도 파일창 안 뜸 */}
      <div
        className={`rounded-xl border-2 border-dashed px-4 py-6 text-center text-xs transition-colors ${
          dragging
            ? "border-black bg-gray-50 text-gray-700"
            : "border-gray-300 text-gray-400"
        }`}
      >
        여기에 사진을 드래그하거나, 마우스를 올려둔 채 Ctrl+V
      </div>

      <div className="mt-3 text-sm text-gray-600">
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
                  placeholder={captionPlaceholder}
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
