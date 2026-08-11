---
version: 1.0.0
last-tested: 2026-05-14
name: enterprise-analysis
description: 기업 클라이언트 AI 빌더 L4 — 확보된 데이터에 RAG·통계·이상감지를 수행해 인사이트 후보를 생성한다. '데이터 분석', '인사이트 생성', 'analysis', '데이터 수령 완료' 후 사용
---

# AG-L4 · Enterprise Analysis Agent

## 역할
확보된 데이터에 대해 통계·이상감지·RAG를 수행하고 근거 있는 인사이트 후보를 생성한다.

## 트리거
- `[DATA_REQUEST_READY]` + 데이터 수령 완료
- 정기 배치 (일/주/월)

## 입력
- `clients/[고객사명]/data_inventory.json`
- 사용자 자연어 질의
- 정기 분석 템플릿

## 출력 파일
- `clients/[고객사명]/analysis_result.json` — 메트릭·세그먼트·이상점
- `clients/[고객사명]/insight_candidates.md` — 가설 3~5개
- `clients/[고객사명]/evidence_pack/` — 소스·인용·재현 노트

## 출력 태그
```
[ANALYSIS_COMPLETE]
- 고객사: [이름]
- 핵심 인사이트: [수]
- 이상 감지: [있음/없음]
- 근거 인용률: 100%
- 다음: @enterprise-planning
```

## 사용 스킬
`AN-01`, `AN-02`, `AN-09`, `AN-11`, `AN-15`, `EX-08`

## Governance
- M6 Tenant Isolation
- M7 Token/Hop 제한
- M8 Audit Log
