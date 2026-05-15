<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# ballute-studio — Project Context (Claude / Codex / future agents)

> Note: 이 repo 는 **public**. 토큰·secret·민감 ID 박지 말 것. 사업 컨텍스트와 운영 룰만 박혀있음.

## 1. 정체

발루트(BALLUTE) 브랜드의 **AI 이미지 생성 파이프라인 (유료 SaaS)**. 모델 컷 / 디테일 컷 / 합성 등 자체 생성.

- **프론트엔드 + API (이 repo)**: Next.js 16 + React 19 + Tailwind 4
- **AI**: Google Gemini API (`@google/genai`)
- **저장**: GCS (`@google-cloud/storage`)
- **DB/Auth**: Supabase (`@supabase/supabase-js`)
- **결제**: Toss Payments (`/charge` 페이지)

## 2. 4가지 이미지 생성 도구

| 라우트 | 정체 |
|--------|------|
| `/studio` | 메인 (모델 / 제품 컷 생성) |
| `/fusion` | 합성 도구 |
| `/dig` | (사장님 확인 필요) |
| `/refrun` | (사장님 확인 필요) |

각 도구의 정확한 역할/입력/출력은 사장님과 작업 시 확인.

## 3. 사업 컨텍스트

- 회사: **시그니처컴퍼니** (브랜드 BALLUTE)
- 사장님이 외주 사진 의존 줄이려고 자체 구축한 도구
- 자매 프로젝트 `ballute-shop` (private) 의 컨텐츠 보조용 — 4채널(카페24/무신사/29CM/W컨셉) 운영
- 추후 결과물이 ballute-shop 으로 자동 push 되는 통합 예정

## 4. 핵심 운영 룰

### 4.1 추측 금지
- 응답 body / 코드 / 실제 동작으로 **확인되지 않은 것은 단정 X**.
- "확인하겠습니다" 가 잘못된 자신감보다 백배 낫다.
- 에러 원인 보고 시 — 직접 본 게 아니면 "~~ 일 가능성" 표현 사용.

### 4.2 디자인/규격 spec 줄 때 정확한 숫자 한 번에
- 픽셀값/규격 요청 시 공식 문서 검증 후 첫 답에 박을 것. 추측 시작 후 보정 사이클 금지.
- IG Stories 광고 (CTA 있음): 캔버스 1080×1920, 텍스트 안전 영역 y=250~1540 (상 250 / 하 380).
- 시각 작업 중 (포토샵/피그마 등) 일수록 정확도 중요 — 한 번 틀리면 export·재배치 시간 낭비.

### 4.3 운영 차단 이슈 즉시 / 보안 이슈는 audit 시점 일괄
- 빌드 실패 / 도메인 안 뜸 / 결제 끊김 = 즉시 해결.
- dev 단계 보안 이슈 (토큰 노출, scope 위반 등) = 발견 보고만 + 배포 전 audit 시점.

### 4.4 미봉책 금지 — 근본 원인부터
- 같은 오류 반복은 최악. 우회책 박기 전 진범(root cause) 짚고 옵션 제시.
- 빠른 우회 박을 때도 "이건 우회책, 진짜 해결은 X" 명시.

### 4.5 작업 속도 + 승인 빈도
- 사장님이 한 번 합의한 흐름은 끝까지. 중간 단계마다 또 승인받지 말 것.
- 반복 패턴 (9~15회 루프) 은 셸 루프로 일괄.

### 4.6 외부 API 호출 절제
- secrets/key 가 박혀있는 외부 서비스 (Gemini, GCS, Supabase, Toss) 는 사용자가 시킨 호출만.
- 검증 차원의 자발적 probe 금지 — quota·rate limit 위험.

## 5. WIP 브랜치 패턴

베타/실험 코드는 **`wip/<feature>` 브랜치** 로 분리. main 에는 검증된 코드만.

현재 active: `wip/studio-beta` (Studio 라우트 + Fusion 수정, 2026-05-14)

## 6. 환경변수 가이드 (값은 secrets 백업에서)

`.env.example` 이 키 템플릿. 실제 값은 1Password / 외장하드 / 사장님 secrets 백업에서.

주요 키:
- `GEMINI_API_KEY` (Google AI Studio)
- `GOOGLE_APPLICATION_CREDENTIALS` (Vertex AI service account)
- `GCS_SERVICE_ACCOUNT_KEY_FILE` (GCS bucket service account)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase)
- `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY` (Toss Payments)

## 7. 추가 컨텍스트

상세 히스토리/룰 (이전 사고 기록, 이미지 생성 디테일 룰 등) 는 사장님 로컬 메모리 (`~/.claude/projects/.../memory/`, 27개 파일) 참고. repo 외부.