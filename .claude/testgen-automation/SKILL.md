---
name: testgen-automation
description: 구현 완료 후 테스트 자동 생성. 스택 감지 후 Playwright/Jest/Vitest/pytest 전략 선택. '구현 완료', 'IMPLEMENTATION COMPLETE', '테스트 생성', '테스트 작성' 언급 시 사용
---

# TestGen 자동화 스킬

## 목표

**"기능 개발 = 테스트 자산 자동 적립"**

구현 완료 후 자동으로 프로젝트 스택을 감지하고, 적합한 테스트 코드를 생성하여 회귀 테스트 자산으로 누적합니다.

---

## 트리거 조건

다음 상황에서 자동 실행:
- [IMPLEMENTATION COMPLETE] 보고 감지
- "구현 완료" 또는 "테스트 생성" 언급
- Task 완료 보고

---

## 실행 절차

### 1. 구현 완료 보고 확인

다음 정보를 수집:
- Task ID
- Feature 이름
- 변경된 파일 목록
- 사용자 플로우

### 2. 테스트 시나리오 설계

- Happy Path 시나리오 (정상 케이스)
- 에러 케이스 시나리오 (실패 케이스)
- 엣지 케이스 시나리오 (경계값, 예외 상황)

### 3. 테스트 전략 라우팅

- 감지 스크립트: `scripts/testgen/detect-test-strategy.sh`
- 전략 선택:
  - Frontend: Playwright + Vitest/RTL
  - Node API: Jest(or Vitest) + Supertest
  - Python API: pytest
  - Fullstack: API + Playwright 스모크 혼합

### 4. 테스트 코드 생성

- E2E 템플릿: `templates/e2e/playwright-regression-template.spec.ts`
- 저장 경로:
  - E2E: `tests/e2e/regression/`
  - Node: `tests/unit/`, `tests/integration/`
  - Python: `tests/`

---

## 출력 형식

```
[TESTGEN COMPLETE]

Detected Stack: [stack]
Selected Strategy: [strategy]
Generated Tests: [개수]

## Test 1: [테스트명] - [시나리오 타입]
- **File:** `[생성 파일 경로]`
- **Type:** [E2E / Integration / Unit]
- **Priority:** P0/P1/P2
- **Scenario:** [시나리오 설명]

## Summary
- **Total Tests Generated:** [개수]
- **By Type:** E2E [n] / Integration [n] / Unit [n]
- **Files Created:** [개수]
- **Location:** [생성 디렉토리 목록]
```

---

## 테스트 생성 후 체인 (필수)

테스트 생성 완료 후 아래 태그를 반드시 출력한다:

```
[TESTGEN_COMPLETE]: TASK-XX
[EVIDENCE]: tests/[생성된 테스트 파일 경로]
```

그런 다음 **테스트 실행 지시**를 함께 제공한다:

```
[TEST_RUN_REQUIRED]: TASK-XX
실행 명령: [npm test / pytest / npx playwright test 등]
대상 파일: [생성된 테스트 파일]
```

실행 결과 수신 후:
- PASS → `[TEST_RESULT]: PASS TASK-XX` 출력
- FAIL → `[TEST_RESULT]: FAIL TASK-XX` 출력 + healer-automation 자동 진입

**changed-files 기반 선택적 실행:**
```bash
bash scripts/select-tests-by-changed.sh
```
변경된 파일에 연관된 테스트만 선택해 실행 범위를 최소화한다.

---

## 금지 사항

- ❌ 코드 수정 금지 (테스트 생성만)
- ❌ 테스트 생성 후 [TESTGEN_COMPLETE] 태그 생략 금지
- ❌ 수동 테스트 작성 금지 (자동 생성만)

---

**참고:** AI-SYSTEM의 `prompts/02_testgen_auto_trigger.md`와 `agents/14_agent_testgen.md`를 참고하세요.
