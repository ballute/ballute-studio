import Link from "next/link";

export default function PrivacyPolicyPage() {
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
            개인정보처리방침
          </h1>
          <p className="mt-4 text-sm md:text-base leading-7 text-gray-700">
            SIGNATURE COMPANY는 이용자의 개인정보를 중요하게 생각하며,
            관련 법령을 준수합니다.
          </p>
        </div>

        <div className="border rounded-2xl bg-white p-6 md:p-8 space-y-8 text-sm md:text-[15px] leading-7 text-black">
          <section>
            <h2 className="text-lg font-semibold mb-3">1. 개인정보처리방침의 목적</h2>
            <p>
              SIGNATURE COMPANY(이하 “회사”)는 이용자의 개인정보를 보호하고,
              이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위해
              본 개인정보처리방침을 수립·공개합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              2. 수집하는 개인정보 항목
            </h2>
            <div className="space-y-2">
              <p>회사는 서비스 제공을 위해 다음과 같은 정보를 수집할 수 있습니다.</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>회원가입 및 로그인 정보: 이메일, 비밀번호, 소셜 로그인 식별정보</li>
                <li>결제 및 포인트 처리 정보: 결제 내역, 포인트 충전/사용 내역</li>
                <li>고객 문의 정보: 이름, 이메일, 문의 내용</li>
                <li>
                  서비스 이용 과정에서 업로드한 자료: 얼굴 이미지, 의상 이미지,
                  레퍼런스 이미지 등 이용자가 직접 업로드한 파일
                </li>
                <li>접속 및 이용기록: 접속 로그, IP, 브라우저 정보, 기기 정보</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              3. 개인정보의 수집 및 이용 목적
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>회원 식별 및 계정 관리</li>
              <li>AI 이미지 생성 서비스 제공</li>
              <li>결제 처리, 포인트 충전/차감 및 환불 처리</li>
              <li>고객 문의 대응 및 공지사항 전달</li>
              <li>서비스 이용 통계 및 운영 안정성 확보</li>
              <li>부정 이용 방지 및 보안 관리</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              4. 개인정보의 보유 및 이용기간
            </h2>
            <p>
              회사는 개인정보의 수집 및 이용 목적이 달성된 후에는 해당 정보를
              지체 없이 파기합니다.
            </p>
            <p className="mt-2">
              다만 관계 법령에 따라 일정 기간 보관이 필요한 경우에는 해당 법령에
              따라 보관할 수 있습니다.
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>계약 또는 청약철회 등에 관한 기록</li>
              <li>대금결제 및 재화 등의 공급에 관한 기록</li>
              <li>소비자 불만 또는 분쟁처리에 관한 기록</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              5. 개인정보의 제3자 제공
            </h2>
            <p>
              회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다.
            </p>
            <p className="mt-2">
              다만 법령에 근거가 있거나, 이용자의 동의가 있는 경우에는 예외로 할
              수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              6. 개인정보 처리의 위탁
            </h2>
            <p>
              회사는 원활한 서비스 제공을 위해 일부 업무를 외부 서비스에 위탁할
              수 있습니다.
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>호스팅 및 배포: Vercel</li>
              <li>데이터베이스 및 인증: Supabase</li>
              <li>결제 처리: Toss Payments</li>
              <li>AI 서비스 제공: Google Gemini 등 회사가 사용하는 AI 인프라</li>
            </ul>
            <p className="mt-2">
              위탁 내용이나 수탁자는 실제 운영 환경에 따라 변경될 수 있으며,
              변경 시 본 방침에 반영합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              7. 정보주체의 권리와 행사방법
            </h2>
            <p>
              이용자는 언제든지 자신의 개인정보에 대해 열람, 정정, 삭제,
              처리정지 요청을 할 수 있습니다.
            </p>
            <p className="mt-2">
              관련 요청은 아래 연락처를 통해 접수할 수 있으며, 회사는 관련 법령에
              따라 지체 없이 조치합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              8. 개인정보의 파기절차 및 방법
            </h2>
            <p>
              회사는 개인정보 보유기간 경과, 처리목적 달성 등 개인정보가
              불필요하게 되었을 때에는 지체 없이 해당 개인정보를 파기합니다.
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>전자적 파일 형태: 복구가 어렵도록 안전한 방식으로 삭제</li>
              <li>종이 문서 형태: 분쇄 또는 소각</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              9. 개인정보의 안전성 확보조치
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>개인정보 접근 권한 최소화</li>
              <li>접근 통제 및 인증 관리</li>
              <li>보안 업데이트 및 시스템 점검</li>
              <li>개인정보 처리 기록 관리</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              10. 개인정보 보호책임자
            </h2>
            <div className="space-y-1">
              <div>책임자: 김순기</div>
              <div>상호: SIGNATURE COMPANY</div>
              <div>연락처: 010-2710-9187</div>
              <div>이메일: official@ballute.co.kr</div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              11. 권익침해 구제방법
            </h2>
            <p>
              이용자는 개인정보 침해에 대한 신고나 상담이 필요한 경우 관계기관에
              문의할 수 있습니다.
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>개인정보침해신고센터</li>
              <li>개인정보분쟁조정위원회</li>
              <li>대검찰청</li>
              <li>경찰청 사이버수사국</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">
              12. 개인정보처리방침의 변경
            </h2>
            <p>
              본 개인정보처리방침은 관련 법령, 서비스 내용 또는 회사 정책에 따라
              변경될 수 있으며, 변경 시 본 페이지를 통해 공지합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">부칙</h2>
            <p>본 개인정보처리방침은 2026년 4월 3일부터 시행합니다.</p>
          </section>
        </div>
      </div>
    </main>
  );
}