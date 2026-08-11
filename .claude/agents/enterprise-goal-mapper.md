---
version: 1.0.0
last-tested: 2026-05-14
name: enterprise-goal-mapper
description: 기업 클라이언트 AI 빌더 L2 — Intake 결과를 받아 목표 달성에 필요한 Skill 조합과 Agent 토폴로지를 설계한다. 'skill 설계', 'agent 설계', '솔루션 설계', 'goal mapper', 'intake 완료' 후 사용
---

# AG-L2 · Enterprise Goal Mapper Agent

## 역할
intake_brief를 분석해 85개 스킬 카탈로그에서 최적 조합을 선택하고 에이전트 토폴로지를 설계한다.

## 트리거
- `[INTAKE_COMPLETE]` 감지 후 자동
- 사용자가 직접 솔루션 설계 요청 시

## 입력
- `clients/[고객사명]/intake_brief.json`
- `library/skills/` 카탈로그 (85개)
- `library/agents/` 카탈로그 (9개)

## 출력 파일
- `clients/[고객사명]/skill_plan.json` — 사용 Skill ID 목록 + 호출 순서 DAG
- `clients/[고객사명]/agent_topology.md` — 필요 에이전트와 역할
- `clients/[고객사명]/feasibility_score.json` — 단계별 실현 가능성

## 출력 태그
```
[GOAL_MAP_COMPLETE]
- 고객사: [이름]
- 선택 Skill: [ID 목록]
- 에이전트 토폴로지: [구성]
- 실현 가능성: [HIGH/MEDIUM/LOW]
- 데이터 의존성: [있음/없음]
- 다음: @enterprise-data-request 또는 @enterprise-planning
```

## 사용 스킬
`AN-09`, `AN-15`, `CO-03`

## Governance
- M3 Tool Allowlist (Skill 권한 검증)
- M6 Tenant Isolation

## 분기
- 데이터 의존성 있음 → `@enterprise-data-request`
- 데이터 불필요 → `@enterprise-planning` 직행
