import Link from "next/link";

export default function TermsPage() {
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
            이용약관
          </h1>
          <p className="mt-4 text-sm md:text-base leading-7 text-gray-700">
            SIGNATURE AI STUDIO 서비스 이용과 관련한 기본 조건을 안내합니다.
          </p>
        </div>

        <div className="border rounded-2xl bg-white p-6 md:p-8 space-y-8 text-sm md:text-[15px] leading-7 text-black">
          <section>
            <h2 className="text-lg font-semibold mb-3">제1조 (목적)</h2>
            <p>
              이 약관은 SIGNATURE COMPANY(이하 “회사”)가 제공하는 SIGNATURE AI
              STUDIO 서비스의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및
              책임사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">제2조 (사업자 정보)</h2>
            <div className="space-y-1">
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
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">제3조 (서비스 내용)</h2>
            <p>
              회사는 이용자가 업로드한 이미지, 입력값 및 선택 옵션을 바탕으로 AI
              기반 이미지 생성 서비스를 제공합니다.
            </p>
            <p className="mt-2">
              서비스는 DIG, REFRUN, FUSION 등 회사가 제공하는 개별 생산 라인을
              포함할 수 있으며, 세부 기능은 운영상 필요에 따라 변경될 수
              있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">제4조 (회원가입 및 계정)</h2>
            <p>
              이용자는 회사가 정한 절차에 따라 회원가입을 신청할 수 있으며,
              회사는 서비스 운영상 필요에 따라 본인확인, 정보 검증 또는 가입
              제한 조치를 할 수 있습니다.
            </p>
            <p className="mt-2">
              이용자는 계정 정보의 정확성을 유지해야 하며, 계정 관리 책임은
              이용자에게 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">제5조 (포인트 충전 및 사용)</h2>
            <p>
              서비스 이용을 위해 필요한 경우 이용자는 포인트를 충전할 수 있으며,
              각 기능별 차감 포인트는 서비스 화면 또는 결제 화면에 표시됩니다.
            </p>
            <p className="mt-2">
              포인트는 회사가 정한 기능 이용 시 차감되며, 무상 지급 포인트와
              유상 충전 포인트는 회사 정책에 따라 구분 관리될 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">제6조 (환불)</h2>
            <p>
              포인트 환불은 별도 게시된 환불규정에 따릅니다.
            </p>
            <p className="mt-2">
              미사용 포인트는 환불 대상이 될 수 있으나, 이미 사용된 포인트 및
              서비스 제공이 개시된 디지털 콘텐츠 이용분은 환불이 제한될 수
              있습니다.
            </p>
            <div className="mt-3 underline">
              <Link href="/refund-policy">환불규정 보기</Link>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              제7조 (이용자의 업로드 자료)
            </h2>
            <p>
              이용자는 서비스 이용을 위해 얼굴 이미지, 의상 이미지, 레퍼런스
              이미지 등 필요한 자료를 업로드할 수 있습니다.
            </p>
            <p className="mt-2">
              이용자는 자신이 업로드한 자료에 대해 적법한 권리를 보유하고
              있어야 하며, 타인의 권리를 침해하는 자료를 업로드해서는 안 됩니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              제8조 (금지행위)
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>타인의 권리를 침해하는 자료의 업로드 또는 사용</li>
              <li>관계 법령에 위반되는 콘텐츠 생성 요청</li>
              <li>서비스를 부정한 방법으로 이용하거나 운영을 방해하는 행위</li>
              <li>타인의 계정 도용 또는 허위 정보 등록</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">제9조 (서비스의 변경 및 중단)</h2>
            <p>
              회사는 운영상, 기술상 필요에 따라 서비스의 전부 또는 일부를 변경,
              일시 중단 또는 종료할 수 있습니다.
            </p>
            <p className="mt-2">
              다만 이용자에게 중대한 영향이 있는 경우에는 사전 또는 사후에
              공지하도록 노력합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">제10조 (책임 제한)</h2>
            <p>
              회사는 천재지변, 시스템 장애, 제3자 서비스 장애 등 회사의
              합리적인 통제 범위를 벗어난 사유로 발생한 손해에 대하여 책임을
              지지 않습니다.
            </p>
            <p className="mt-2">
              AI 생성 결과물은 입력 자료 및 모델 특성에 따라 달라질 수 있으며,
              회사는 이용자가 기대한 주관적 결과와의 차이 자체만으로는 책임을
              부담하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              제11조 (지식재산권)
            </h2>
            <p>
              서비스, 소프트웨어, 디자인, 로고, 텍스트 등 회사가 제공하는
              요소에 관한 권리는 회사에 귀속됩니다.
            </p>
            <p className="mt-2">
              이용자가 업로드한 자료에 대한 권리는 원칙적으로 해당 이용자 또는
              정당한 권리자에게 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">제12조 (준거법 및 관할)</h2>
            <p>
              본 약관은 대한민국 법령에 따라 해석되며, 서비스 이용과 관련하여
              회사와 이용자 간에 분쟁이 발생한 경우 관련 법령에 따른 관할법원을
              따릅니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">부칙</h2>
            <p>본 약관은 2026년 4월 3일부터 시행합니다.</p>
          </section>
        </div>
      </div>
    </main>
  );
}