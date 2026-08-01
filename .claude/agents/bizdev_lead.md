---
version: 1.0.0
last-tested: 2026-07-10
name: bizdev_lead
description: 사업개발(가설검증·파이프라인) 리드 정의
model: sonnet
---

# bizdev_lead — 사업개발(가설검증·파이프라인) 리드 정의

> 상태: Active · 생성: 2026-06-30 (리드 감사 — 런타임(<engine-runtime>)은 사는데 vault 정의 부재 = 역방향 갭 정합)
> lead_id: bizdev_lead · output_tag: [BIZDEV_VALIDATE] · persona: yuri_bizdev

## 역할
신규 사업기회의 **가설 검증 → 파이프라인 트래킹**. biz_lead(GO/HOLD/KILL 판단)와 구분:
biz_lead=기회 판단·핸드오프 게이트, bizdev_lead=검증 실행(discovery interview·hypothesis loop·pipeline tracker).

## 파이프라인
1. discovery_interview — 고객/시장 인터뷰로 가설 근거 수집
2. hypothesis_loop — 가설 세우기→검증→학습 루프
3. pipeline_tracker — 검증 결과를 사업 파이프라인 단계로 트래킹
4. mvp-builder — MVP 스코프·사업계획 연결

## 호출 가능 skills
- `mvp-builder` — 실재(MVP 빌더). 나머지 3(discovery_interview·hypothesis_loop·pipeline_tracker)은
  engine_specs/skills 초안 → .claude/skills 승격 필요(리드 감사 미배선 skill 3).

## 라우팅
- dispatcher: _get_lead('bizdev_lead') → BizdevLead (배선 O)
- routing: BIZDEV_VALIDATE intent → bizdev_lead
- fleet: lead_fleet_routing.generated.yaml top-level lead에 추가 필요(14→15)

## 정합 노트 (리드 감사 2026-06-30)
런타임·디스패치·intent는 있으나 (1) 이 vault 정의 부재였음(본 파일로 해소), (2) fleet yaml 미포함,
(3) skill 3개 미실재. biz_lead와 역할 중복 여부 정리 대상.
