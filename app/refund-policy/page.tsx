import Link from "next/link";

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f5] px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-gray-600 mb-4"
          >
            ← 홈으로
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-black">
            환불규정
          </h1>
          <p className="mt-4 text-sm md:text-base leading-7 text-gray-700">
            SIGNATURE AI STUDIO의 포인트 결제 및 환불 기준을 안내드립니다.
          </p>
        </div>

        <div className="border rounded-2xl bg-white p-6 md:p-8 space-y-8 text-sm md:text-[15px] leading-7 text-black">
          <section>
            <h2 className="text-lg font-semibold mb-3">1. 기본 원칙</h2>
            <p>
              본 서비스는 포인트를 충전한 후 이미지 생성 등에 사용하는 구조입니다.
              환불은 충전된 포인트의 사용 여부를 기준으로 판단합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">2. 미사용 포인트 환불</h2>
            <p>
              충전 후 사용되지 않은 포인트는 환불이 가능합니다.
            </p>
            <p className="mt-2">
              단, 실제 결제 취소가 불가능한 결제 시점이 지난 경우에는
              결제 수단별 정산 구조에 따라 환불 처리 기간이 추가로 소요될 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">3. 일부 사용된 포인트</h2>
            <p>
              포인트를 일부 사용한 경우에는 사용되지 않은 잔여 포인트에 한하여 환불이 가능합니다.
            </p>
            <p className="mt-2">
              이미 사용된 포인트에 해당하는 금액은 환불되지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">4. 환불이 불가한 경우</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>포인트를 사용하여 이미지 생성 등 서비스 이용이 시작된 경우</li>
              <li>이미 사용 완료된 포인트</li>
              <li>이벤트, 무상 지급, 프로모션 등으로 제공된 무상 포인트</li>
            </ul>
            <p className="mt-3">
              디지털 콘텐츠 서비스의 특성상, 서비스 제공이 개시된 이후에는 환불이 제한될 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">5. 생성 실패 또는 시스템 오류</h2>
            <p>
              시스템 오류, 서버 장애, 정상 처리 실패 등 당사 귀책 사유가 확인되는 경우,
              해당 건에 사용된 포인트는 재지급 또는 환불 처리될 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">6. 환불 요청 방법</h2>
            <p>환불 요청은 아래 이메일로 접수해 주세요.</p>
            <div className="mt-3 space-y-1">
              <div>이메일: official@ballute.co.kr</div>
              <div>상호: SIGNATURE COMPANY</div>
              <div>대표자: 김순기</div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">7. 환불 처리 기간</h2>
            <p>
              환불 요청 확인 후 영업일 기준 3~7일 이내 처리됩니다.
              다만 결제 수단 및 카드사/결제대행사 사정에 따라 실제 반영 시점은 달라질 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">8. 유의사항</h2>
            <p>
              본 환불규정은 관련 법령 및 서비스 운영 정책에 따라 변경될 수 있으며,
              변경 시 본 페이지를 통해 공지합니다.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}