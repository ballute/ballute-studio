-- 영구 캐시 테이블: face/pose/bg/location 분석 결과 재사용
-- cache_key 포맷:
--   face:<sha256(faceBase64)>:v2
--   pose:<sha256(poseBase64)>:v2
--   bg:<sha256(joined bgBase64s)>:<backgroundMode>:v2
--   loc:<sha256(JSON.stringify(bgDNA))>:<count>:<backgroundMode>:v2
-- prompt가 바뀌면 cache key의 :vN 버전을 올려서 자동 무효화
create table if not exists public.genai_analysis_cache (
  cache_key text primary key,
  result jsonb not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists genai_analysis_cache_last_used_at_idx
  on public.genai_analysis_cache (last_used_at);
