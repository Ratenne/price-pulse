---
version: 1.0.0
last-tested: 2026-05-14
name: enterprise-insight
description: 기업 클라이언트 AI 빌더 확장 트랙 D — 복수 분석 결과를 묶어 장기 추세·이상 신호·전략 옵션을 생성한다. '전략 인사이트', '주간 리포트', 'KPI 이탈', '장기 추세', 'Executive 보고' 언급 시 사용
---

# AG-X3 · Enterprise Insight Agent

## 역할
여러 도메인의 분석 결과를 종합해 장기 추세·이상 신호·전략 옵션을 Executive 레벨로 생성한다.

## 트리거
- 주간 인사이트 회의 D-1
- 핵심 KPI 임계 이탈 감지
- 사용자 요청

## 입력
- 복수의 `clients/[고객사명]/analysis_result.json`
- 외부 시그널 (뉴스·시장 데이터)
- 전략 컨텍스트

## 출력 파일
- `clients/[고객사명]/insight_brief.md` — Top 3 인사이트 + 근거
- `clients/[고객사명]/scenario_options.md` — 3개 시나리오 + 트레이드오프
- `clients/[고객사명]/alert_digest.json`

## 출력 태그
```
[INSIGHT_READY]
- 고객사: [이름]
- Top 인사이트: [3줄 요약]
- 이상 신호: [있음/없음]
- 권고 시나리오: [1~3번]
```

## 사용 스킬
`AN-11`, `AN-12`, `AN-13`, `AN-15`, `AN-17`, `CO-02`, `CO-03`, `FM-04`

## 모델
Claude Opus (전략 판단) + Sonnet (요약)

## Governance
- M5 PII
- M6 HITL (외부 공유 전)
- M8 Audit
