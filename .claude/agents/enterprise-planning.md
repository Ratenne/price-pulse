---
version: 1.0.0
last-tested: 2026-05-14
name: enterprise-planning
description: 기업 클라이언트 AI 빌더 L5 — 분석 결과를 받아 실행 가능한 액션 플랜·의사결정 브리프·리스크 레지스터를 생성한다. '액션 플랜', '실행 계획', 'planning', '분석 완료' 후 사용
---

# AG-L5 · Enterprise Planning Agent

## 역할
분석 결과를 받아 실행 가능한 액션 플랜과 책임자·일정·예상 효과를 산출한다.

## 트리거
- `[ANALYSIS_COMPLETE]` 감지
- 사용자 직접 요청

## 입력
- `clients/[고객사명]/analysis_result.json`
- 조직 R&R (수동 입력)
- 현재 캘린더·우선순위

## 출력 파일
- `clients/[고객사명]/action_plan.md` — Step·Owner·Due·KPI
- `clients/[고객사명]/decision_brief.md` — 3가지 옵션 + 권고
- `clients/[고객사명]/risk_register.json` — 리스크·완화책

## 출력 태그
```
[PLAN_READY]
- 고객사: [이름]
- 액션 수: [수]
- 권고 옵션: [1~3]
- 리스크 수준: [HIGH/MEDIUM/LOW]
- 다음: @enterprise-builder (승인 후)
```

## 사용 스킬
`AN-09`, `CO-02`, `CO-04`, `FM-04`

## Governance
- M6 HITL (액션 실행 전 사람 승인 필수)
- M8 Audit Log
