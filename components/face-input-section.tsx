"use client";

type FaceUploadItem = {
  file: File;
  preview: string;
};

type FaceInputSectionProps = {
  items: FaceUploadItem[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveItem: (index: number) => void;
  onClearAll: () => void;
  onGenerate: () => void;
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
  return (
    <div className="border rounded-2xl p-6 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-xl font-bold">모델 얼굴 입력</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-black text-white">
          필수
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-4 leading-6">
        모델 정체성을 고정하는 기준 이미지. 모델 이미지가 있으면 업로드,
        없으면 생성 기능으로 얼굴 앵커를 만들 수 있다.
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <div className="border rounded-2xl p-5 bg-[#fafaf8]">
          <div className="text-sm font-semibold mb-3">UPLOAD</div>
          <p className="text-xs text-gray-600 mb-4">
            실제 모델 이미지가 있는 경우. 여러 장 업로드 가능.
          </p>

          <div className="flex flex-wrap gap-3">
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

        <div className="border rounded-2xl p-5 bg-[#fafaf8]">
          <div className="text-sm font-semibold mb-3">GENERATE</div>
          <p className="text-xs text-gray-600 mb-4">
            모델 이미지가 없는 경우. 목까지만 보이는 얼굴 앵커를 생성한다.
          </p>

          <button
            type="button"
            onClick={onGenerate}
            disabled={disabled || generating}
            className="px-4 py-3 rounded-xl text-sm bg-black text-white disabled:opacity-60"
          >
            {generating ? "모델 생성중..." : "모델 생성 (30P)"}
          </button>
        </div>
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