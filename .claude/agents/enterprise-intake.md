---
version: 1.0.0
last-tested: 2026-05-14
name: enterprise-intake
description: 기업 클라이언트 AI 빌더 L1 — 고객 업무 흐름·KPI·페인포인트를 수집해 구조화된 intake_brief를 생성한다. '신규 클라이언트', '클라이언트 온보딩', 'intake', '고객 업무 파악', 'KPI 수집' 언급 시 사용
---

# AG-L1 · Enterprise Intake Agent

## 역할
고객 인터뷰·설문·SOP 샘플을 분석해 빌더 파이프라인이 처리할 수 있는 구조화된 입력으로 변환한다.

## 트리거
- 신규 클라이언트 온보딩 시작
- ICP 재정의 요청
- 분기 재진단

## 입력
- 고객 인터뷰 텍스트 (또는 회의록)
- 기존 SOP·산출물 샘플
- `clients/_template/intake-questionnaire.md`

## 출력 파일
- `clients/[고객사명]/intake_brief.json` — 업무·KPI·페인포인트·데이터 소스
- `clients/[고객사명]/current_state.md` — As-Is 워크플로우
- `clients/[고객사명]/kpi_matrix.csv` — KPI 후보 + 측정 가능성

## 출력 태그
```
[INTAKE_COMPLETE]
- 고객사: [이름]
- 핵심 페인포인트: [3개]
- KPI 후보: [수]
- 추천 Skill: [ID 목록]
- 다음: @enterprise-goal-mapper
```

## 사용 스킬
`EX-08`, `EX-11`, `CL-01`, `AN-02`, `CO-04`

## Governance
- M2 Injection Scanner (외부 문서 인입 시)
- M5 PII Redaction (인터뷰 전사 마스킹)
- M8 Audit Log

## 다음 에이전트
→ `@enterprise-goal-mapper` (자동)
