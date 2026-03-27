"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

type UploadItem = {
  file: File | null;
  preview: string | null;
};

type UploadCardProps = {
  title: string;
  required?: boolean;
  description: string;
  goodExamples: string[];
  badExamples: string[];
  value: UploadItem;
  onChange: (file: File | null) => void;
};

function UploadCard({
  title,
  required = false,
  description,
  goodExamples,
  badExamples,
  value,
  onChange,
}: UploadCardProps) {
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 text-sm">
        <div className="border rounded-xl p-4 bg-gray-50">
          <div className="font-semibold mb-2">좋은 예시</div>
          <ul className="space-y-1 text-gray-700 list-disc pl-5">
            {goodExamples.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="border rounded-xl p-4 bg-gray-50">
          <div className="font-semibold mb-2">피해야 할 예시</div>
          <ul className="space-y-1 text-gray-700 list-disc pl-5">
            {badExamples.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <label className="block cursor-pointer">
        {value.preview ? (
          <img
            src={value.preview}
            alt={title}
            className="w-full h-64 object-cover rounded-xl border"
          />
        ) : (
          <div className="w-full h-64 border-2 border-dashed rounded-xl flex items-center justify-center text-gray-400 text-sm">
            클릭해서 이미지 업로드
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
      </label>

      {value.file ? (
        <div className="mt-3 text-sm text-gray-600 truncate">
          선택 파일: {value.file.name}
        </div>
      ) : (
        <div className="mt-3 text-sm text-gray-400">아직 업로드 안 됨</div>
      )}
    </div>
  );
}

export default function EditorPage() {
  const searchParams = useSearchParams();
  const projectName = searchParams.get("name") ?? "이름 없음";
  const projectType = searchParams.get("type") ?? "타입 없음";

  const [face, setFace] = useState<UploadItem>({ file: null, preview: null });
  const [outfit, setOutfit] = useState<UploadItem>({ file: null, preview: null });
  const [bg, setBg] = useState<UploadItem>({ file: null, preview: null });
  const [pose, setPose] = useState<UploadItem>({ file: null, preview: null });

  const [loading, setLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string>("");

  const updateUpload = (
    setter: React.Dispatch<React.SetStateAction<UploadItem>>,
    file: File | null
  ) => {
    if (!file) {
      setter({ file: null, preview: null });
      return;
    }

    const preview = URL.createObjectURL(file);
    setter({ file, preview });
  };

  const handleGenerate = async () => {
    if (!face.file || !outfit.file) {
      alert("얼굴 이미지와 의상 이미지는 필수다.");
      return;
    }

    try {
      setLoading(true);
      setResultImage(null);
      setResultMessage("");

      const formData = new FormData();
      formData.append("projectName", projectName);
      formData.append("projectType", projectType);
      formData.append("face", face.file);
      formData.append("outfit", outfit.file);

      if (bg.file) formData.append("bg", bg.file);
      if (pose.file) formData.append("pose", pose.file);

      const res = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "생성 실패");
      }

      if (data.image) {
        setResultImage(`data:image/png;base64,${data.image}`);
        setResultMessage("생성 완료");
      } else {
        setResultMessage(data?.message || "응답은 왔지만 이미지가 없음");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "알 수 없는 오류";
      setResultMessage(`오류: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f7f5] px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-3">프로젝트 편집기</h1>
          <div className="border rounded-2xl p-5 bg-white space-y-2">
            <div>
              <span className="font-semibold">프로젝트 이름:</span> {projectName}
            </div>
            <div>
              <span className="font-semibold">타입:</span> {projectType}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <UploadCard
            title="얼굴 업로드"
            required
            description="모델 정체성을 고정하는 기준 이미지다. 얼굴 윤곽, 턱선, 눈/코/입 비율이 잘 보이는 사진이 좋다."
            goodExamples={[
              "정면 또는 반측면 얼굴",
              "얼굴이 크게 보이고 선명한 사진",
              "과하지 않은 표정",
              "마스크/선글라스 없이 얼굴이 드러난 이미지",
            ]}
            badExamples={[
              "얼굴이 잘린 사진",
              "셀카 왜곡이 심한 사진",
              "선글라스/모자/마스크로 가려진 사진",
              "조명이 너무 강해서 얼굴이 날아간 사진",
            ]}
            value={face}
            onChange={(file) => updateUpload(setFace, file)}
          />

          <UploadCard
            title="의상 업로드"
            required
            description="AI가 실제로 재구성해야 하는 착장 기준 이미지다. 가능하면 얼굴 없는 착장컷이 가장 좋다."
            goodExamples={[
              "얼굴 없이 옷 중심으로 보이는 착장컷",
              "핏, 길이감, 주름이 확인되는 사진",
              "상의/하의 실루엣이 명확한 이미지",
              "배경 방해가 적은 사진",
            ]}
            badExamples={[
              "누끼 제품컷만 있는 이미지",
              "옷 일부만 보이는 사진",
              "핏이 보이지 않는 접힌 옷 사진",
              "여러 옷이 섞여서 기준이 모호한 사진",
            ]}
            value={outfit}
            onChange={(file) => updateUpload(setOutfit, file)}
          />

          <UploadCard
            title="배경 업로드"
            description="장소의 분위기, 재질감, 빛의 방향을 정하는 참고 이미지다. 공간 사진 위주가 좋다."
            goodExamples={[
              "사람 없는 공간 사진",
              "벽, 바닥, 계단, 건물 재질이 잘 보이는 이미지",
              "빛과 공기감이 느껴지는 장소 사진",
              "브랜드 무드에 맞는 환경 이미지",
            ]}
            badExamples={[
              "모델이 중심인 화보 사진",
              "옷 참고까지 섞인 이미지",
              "배경보다 인물이 주인공인 사진",
              "너무 복잡해서 핵심 공간이 안 보이는 이미지",
            ]}
            value={bg}
            onChange={(file) => updateUpload(setBg, file)}
          />

          <UploadCard
            title="포즈 업로드"
            description="모델의 자세, 체중 이동, 손 위치, 시선 방향을 정하는 참고 이미지다."
            goodExamples={[
              "전신 또는 반신 포즈 사진",
              "팔, 손, 몸 기울기가 보이는 이미지",
              "시선 방향과 태도가 읽히는 사진",
              "포즈 자체가 명확한 컷",
            ]}
            badExamples={[
              "몸이 너무 잘린 사진",
              "포즈가 모호한 사진",
              "배경 참고가 더 강한 이미지",
              "옷 참고와 포즈 참고가 뒤섞인 사진",
            ]}
            value={pose}
            onChange={(file) => updateUpload(setPose, file)}
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mt-8 w-full bg-black text-white py-5 rounded-2xl text-xl disabled:opacity-60"
        >
          {loading ? "생성중..." : "룩북 생성하기"}
        </button>

        <div className="mt-6 border rounded-2xl p-5 bg-white">
          <div className="font-semibold mb-2">상태</div>
          <div className="text-sm text-gray-700">
            {resultMessage || "아직 생성 전"}
          </div>
        </div>

        {resultImage ? (
          <div className="mt-8 border rounded-2xl p-6 bg-white">
            <h2 className="text-2xl font-bold mb-4">생성 결과</h2>
            <img
              src={resultImage}
              alt="생성 결과"
              className="w-full max-w-md rounded-xl border"
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}