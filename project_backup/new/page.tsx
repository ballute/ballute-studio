"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [type, setType] = useState("룩북");

  const handleCreate = () => {
    if (!name) {
      alert("프로젝트 이름 입력해라");
      return;
    }

    // 다음 단계로 이동 (임시)
    router.push(`/project/editor?name=${name}&type=${type}`);
  };

  return (
    <main className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-full max-w-xl px-6">
        <h1 className="text-3xl font-bold mb-4">새 프로젝트</h1>

        <div className="border rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              프로젝트 이름
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
              placeholder="예: 26SS 셔츠 룩북"
              className="w-full border rounded-lg px-4 py-3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              프로젝트 타입
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full border rounded-lg px-4 py-3"
            >
              <option>룩북</option>
              <option>광고</option>
              <option>상세페이지</option>
            </select>
          </div>

          <button
            onClick={handleCreate}
            className="w-full bg-black text-white rounded-lg py-3"
          >
            생성하기
          </button>
        </div>
      </div>
    </main>
  );
}