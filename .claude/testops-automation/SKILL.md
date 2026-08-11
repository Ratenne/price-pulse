---
name: testops-automation
description: 테스트 완료 후 결과 분석 및 트렌드 추적. 실패 분류, Flaky 감지. '테스트 완료', 'TEST EXECUTION COMPLETE', 'TestOps', '테스트 결과 분석' 언급 시 사용
---

# TestOps 자동화 스킬

## 목표

**"QA 운영 = 데이터 기반 의사결정"**

테스트 실행 완료 후 자동으로 결과를 분석하고 트렌드를 추적합니다.

---

## 트리거 조건

다음 상황에서 자동 실행:
- [TEST EXECUTION COMPLETE] 보고 감지
- 테스트 실행 완료 감지
- "테스트 완료" 또는 "TestOps" 언급

---

## 실행 절차

### 1. 테스트 결과 수집

다음 정보를 수집:
- Test Run ID
- 총 테스트 수
- 통과/실패 수
- 실행 시간
- 타임스탬프

수집 즉시 누적 저장:
- `python3 scripts/testops/append-test-result.py ...`
- 저장 위치: `docs/analysis-results/testops-history/results.jsonl`

### 2. 실패 분류

다음 카테고리로 분류:
- **Locator 실패:** 셀렉터를 찾을 수 없음
- **Flow 실패:** 사용자 플로우 단계 문제
- **Code 실패:** 코드 버그 또는 로직 문제
- **Environment 실패:** 환경 설정 문제
- **Flaky:** 간헐적 실패 (재현 불가)

### 3. Flaky 감지

- 동일 테스트의 과거 실행 결과 비교
- 간헐적 실패 패턴 감지
- Flaky 테스트 목록 생성

### 4. 트렌드 분석

- 테스트 통과율 트렌드
- 실패 유형별 트렌드
- 시간대별 트렌드
- 누적 데이터 요약:
  - `python3 scripts/testops/summarize-history.py`
  - 출력: `docs/analysis-results/testops-history/summary.json`

### 5. TestOps Report 생성

- 실패 분류 요약
- Flaky 테스트 목록
- 트렌드 분석 결과
- 대시보드 데이터

---

## 출력 형식

```
[TestOps REPORT]

## Test Execution Summary
- **Test Run ID:** [ID]
- **Total Tests:** [개수]
- **Passed:** [개수]
- **Failed:** [개수]
- **Duration:** [시간]
- **Timestamp:** [타임스탬프]

## Failure Classification
- **Locator Failures:** [개수]
- **Flow Failures:** [개수]
- **Code Failures:** [개수]
- **Environment Failures:** [개수]
- **Flaky Tests:** [개수]

## Flaky Tests Detected
1. **TC-XXX:** [테스트명]
   - Failure Rate: [비율]
   - Pattern: [패턴 설명]

## Trend Analysis
- **Pass Rate Trend:** [트렌드 설명]
- **Failure Type Trend:** [트렌드 설명]

## Dashboard Data
- [대시보드용 데이터]
```

---

## 금지 사항

- ❌ 테스트 실행 금지 (분석만)
- ❌ 코드 수정 금지 (분석만)
- ❌ UX 판단 금지 (기술적 문제만)

---

**참고:** `agents/16_agent_testops.md`, `docs/analysis-results/testops-history/README.md`
