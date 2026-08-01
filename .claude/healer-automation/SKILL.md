---
name: healer-automation
description: 테스트 실패 시 자동 원인 분석 및 수정 제안. '테스트 실패', 'TEST EXECUTION FAILED', '테스트 에러', '테스트 실패 분석' 언급 시 사용
---

# Healer 자동화 스킬

## 목표

**"실패 = 사람이 아니라 Healer"**

테스트가 실패하면, 자동으로 원인을 분석하고 수정 제안을 생성합니다.

---

## 트리거 조건

다음 상황에서 자동 실행:
- [TEST EXECUTION FAILED] 보고 감지
- 테스트 실행 실패 감지
- "테스트 실패" 또는 "테스트 에러" 언급

---

## 실행 절차

### 1. 테스트 실패 보고 확인

다음 정보를 수집:
- Test ID
- 실패한 단계
- 에러 타입 및 메시지
- 아티팩트 (스크린샷, 로그, HAR 등)

### 2. 실패 원인 분석

다음 카테고리 중 하나로 분류:
- **Locator 실패:** 셀렉터를 찾을 수 없음 (가장 흔함)
- **Flow 실패:** 사용자 플로우 단계 문제
- **Code 실패:** 코드 버그 또는 로직 문제
- **Environment 실패:** 환경 설정 문제

### 3. 수정 제안 생성

#### Locator 실패인 경우:
- 현재 셀렉터 분석
- 대체 셀렉터 제안 (의미 기반 우선순위):
  1. `aria-label` (최우선)
  2. `role` (2순위)
  3. `data-testid` (3순위)
  4. DOM fallback (최후 수단)
- 자가치유 로직 포함 (대체 셀렉터 체인)

#### Flow 실패인 경우:
- 실패한 단계 분석
- 단계별 재시도 로직 제안
- 대기 시간 조정 제안

#### Code 실패인 경우:
- 실패 원인 코드 위치 식별
- 코드 패치 제안 (diff 스타일)

#### Environment 실패인 경우:
- 환경 설정 문제 식별
- 환경 점검 요청

### 4. 우선순위 부여

- P0 (Must Fix): 즉시 수정 필요
- P1 (Should Fix): 빠른 시일 내 수정 권장
- P2 (Nice to Fix): 선택적 개선

---

## 출력 형식

```
[HEALER REPORT]

## Failure Analysis
- **Failure Category:** [Locator/Flow/Code/Environment]
- **Root Cause:** [근본 원인]
- **Failure Step:** [실패한 단계]

## Fix Proposals

### Fix 1: [수정 제안명]
- **Type:** [Locator Fix / Flow Fix / Code Patch / Environment Fix]
- **Priority:** P0/P1/P2
- **Description:** [수정 제안 설명]
- **Proposed Change:**
  ```
  [수정 방법 상세]
  ```
- **Expected Time:** [예상 소요 시간]

## Summary
- **Total Fix Proposals:** [개수]
- **Must Fix (P0):** [개수]
- **Should Fix (P1):** [개수]
- **Nice to Fix (P2):** [개수]

## Next Steps
1. [우선순위별 수정 순서]
2. [Cursor에 수정 요청 전달 방법]
3. [테스트 재실행 방법]
```

---

## 재진입 루프 (Retry Loop)

수정 제안 적용 후 **반드시 테스트를 재실행**하고 결과를 태그로 출력해야 한다.

### 루프 규칙

```
[TEST_RESULT]: FAIL
  → healer-automation 실행 (1st retry)
  → 수정 적용 → 테스트 재실행
  → [TEST_RESULT]: FAIL again
  → healer-automation 실행 (2nd retry)
  → 수정 적용 → 테스트 재실행
  → [TEST_RESULT]: FAIL (3rd)
  → [HEALER_ESCALATE]: MANUAL_REVIEW 출력 (루프 종료)
```

### 재시도 제한

- `docs/state/execution-context.md`의 `test.retries` 필드 확인
- retries ≥ 2이면 루프 중단 후 `[HEALER_ESCALATE]` 출력

### 재시도 시 출력 형식

```
[HEALER_RETRY]: N/2
[TASK]: TASK-XX
[FIX_APPLIED]: [적용한 수정 요약]
[RETEST_REQUIRED]: true
```

### 루프 종료 (통과 시)

```
[TEST_RESULT]: PASS TASK-XX
[HEALER_RESOLVED]: true
[EVIDENCE]: [수정된 파일 경로]
```

### 루프 종료 (에스컬레이션)

```
[HEALER_ESCALATE]: MANUAL_REVIEW
[TASK]: TASK-XX
[RETRIES_EXHAUSTED]: 2/2
[REASON]: [반복 실패 원인 요약]
[HUMAN_ACTION]: [사람이 해야 할 조치]
```

---

## 금지 사항

- ❌ 직접 코드 수정 금지 (제안만, 수정은 Cursor)
- ❌ retries 확인 없이 무한 재시도 금지
- ❌ UX 판단 금지 (기술적 문제만)

---

**참고:** AI-SYSTEM의 `agents/healer.md`, `docs/state/execution-context.md` 참고.
