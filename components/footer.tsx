import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full border-t mt-24 py-16 px-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="text-sm leading-6 space-y-2 text-black">
          <div>상호: SIGNATURE COMPANY</div>
          <div>대표자: 김순기</div>
          <div>사업자등록번호: 485-13-00268</div>
          <div>통신판매업 신고번호: 2026-서울중구-375</div>
          <div>
            사업장 주소: 04563 서울특별시 중구 장충단로13길 20 (을지로6가)
            현대시티타워 12층 무신사스튜디오 발루트
          </div>
          <div>연락처: 010-2710-9187</div>
          <div>이메일: official@ballute.co.kr</div>

          <div className="flex flex-wrap gap-4 pt-6 underline">
            <Link href="/terms">이용약관</Link>
            <Link href="/privacy-policy">개인정보처리방침</Link>
            <Link href="/refund-policy">환불규정</Link>
          </div>

          <div className="pt-8 text-xs text-gray-500">© BALLUTE</div>
        </div>
      </div>
    </footer>
  );
}