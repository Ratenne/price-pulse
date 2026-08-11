---
version: 1.0.0
last-tested: 2026-05-14
name: enterprise-data-request
description: 기업 클라이언트 AI 빌더 L3 — Skill Plan 실행에 필요한 데이터·권한을 식별하고 고객에게 요청 목록을 생성한다. '데이터 요청', '권한 목록', 'data request', '필요 데이터 파악' 언급 시 사용
---

# AG-L3 · Enterprise Data Request Agent

## 역할
skill_plan 실행에 필요한 데이터 소스·권한·자격을 식별하고, 고객이 제공해야 할 항목을 명세한다.

## 트리거
- `[GOAL_MAP_COMPLETE]` + 데이터 의존성 있음

## 입력
- `clients/[고객사명]/skill_plan.json`
- 고객 데이터 카탈로그 (수동 입력 또는 인터뷰)

## 출력 파일
- `clients/[고객사명]/data_request.md` — 요청 항목·승인 경로·SLA
- `clients/[고객사명]/data_inventory.json` — 확보 데이터 메타
- `clients/[고객사명]/permission_matrix.csv` — R/W 권한 표

## 출력 태그
```
[DATA_REQUEST_READY]
- 고객사: [이름]
- 요청 항목: [수]
- PII 포함 여부: [있음/없음]
- 승인 대기: [있음/없음]
- 다음: @enterprise-analysis (데이터 수령 후)
```

## 사용 스킬
`EX-10`, `EX-12`, `CL-08`

## Governance
- M2 Injection Scanner
- M3 Allowlist
- M5 PII Redaction (PII 누락 0건 목표)
