import Link from "next/link";

const lines = [
  {
    title: "DIG",
    href: "/dig",
    description:
      "무드 키워드 기반으로 리서치하고, 여러 크리에이티브 디렉션을 생성하는 생산 라인",
    points: [
      "모델 얼굴 여러 장",
      "의상 착샷 여러 장",
      "무드 키워드 입력",
      "count / fit / shooting mode",
    ],
  },
  {
    title: "REFRUN",
    href: "/refrun",
    description:
      "레퍼런스 이미지의 구도, 무드, 사진 문법을 분석해서 그대로 따라가는 생산 라인",
    points: [
      "모델 얼굴 여러 장",
      "의상 착샷 여러 장",
      "레퍼런스 이미지 여러 장",
      "fit / shooting mode",
    ],
  },
  {
    title: "FUSION",
    href: "/fusion",
    description:
      "배경 DNA와 포즈 블루프린트를 결합해서 고급 editorial 결과를 만드는 생산 라인",
    points: [
      "모델 얼굴 여러 장",
      "의상 착샷 여러 장",
      "배경 여러 장",
      "포즈 여러 장",
    ],
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f7f7f5] px-6 py-12">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <h1 className="text-5xl font-bold tracking-tight mb-4">
            BALLUTE STUDIO
          </h1>
          <p className="text-gray-700 text-lg leading-8 max-w-3xl">
            발루트 이미지 생산 시스템. 먼저 생산 라인을 선택하고, 그 라인에
            필요한 입력만 넣어서 작업을 시작한다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {lines.map((line) => (
            <Link
              key={line.title}
              href={line.href}
              className="block rounded-3xl border bg-white p-7 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-3xl font-bold">{line.title}</h2>
                <span className="text-sm px-3 py-1 rounded-full border text-gray-600">
                  생산 라인
                </span>
              </div>

              <p className="text-gray-700 leading-7 mb-6">{line.description}</p>

              <div className="border rounded-2xl p-4 bg-[#fafaf8]">
                <div className="font-semibold mb-3">주요 입력</div>
                <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
                  {line.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-6">
                <div className="inline-flex items-center justify-center rounded-xl bg-black text-white px-5 py-3 text-sm font-medium">
                  {line.title} 시작하기
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}