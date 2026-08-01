# QA/프론트엔드/디버깅 프롬프트 모음

> 4가지 주요 요청 시나리오별 프롬프트 모음

**작성일:** 2026-02-04
**목적:** QA 요청, UI/UX 분석, 프론트엔드 검증, 기능 오류 해결을 위한 재사용 가능한 프롬프트 제공

---

## 📋 프롬프트 목록

### 1. QA 요청

#### 방법 1: 전체 QA 파이프라인 실행
```
구현 완료! QA 검증해줘.
```
→ 자동 실행:
1. TestGen 자동 실행 (테스트 생성)
2. UX Gate 자동 실행 (UX 검증)
3. Antigravity E2E 실행 (DOM 자동화 테스트)
4. Healer 자동 실행 (실패 시)
5. Security Tests 실행
6. TestOps 실행 (결과 분석)
7. QA Judge 실행 (Go/No-Go 판정)

#### 방법 2: TestGen Agent 사용
```
@testgen
구현 완료한 기능에 대한 테스트를 생성해줘.
```

#### 방법 3: TestOps Agent 사용
```
테스트 완료했어. 결과 분석해줘.
```
→ `testops-automation` Skill 자동 실행

**참고 문서:**
- `playbook/02-qa-testing/integrated-qa-scenarios.md` - 통합 QA 실행 시나리오
- `playbook/02-qa-testing/qa-governance.md` - QA 거버넌스

---

### 2. UI/UX 분석 요청

#### 방법 1: Command 사용 (단일 화면)
```
/ux-gate
로그인 페이지 UX 검증해줘.
```

#### 방법 2: Agent 사용 (복잡한 분석)
```
@ux-gate
회원가입 플로우 전체를 검증해줘.
- 1단계: 이메일 입력
- 2단계: 정보 입력
- 3단계: 인증
- 4단계: 완료
```

#### 방법 3: 자동 실행
```
구현 완료! UX 검증해줘.
```
→ `ux-gate-automation` Skill 자동 실행

**참고 문서:**
- `playbook/02-qa-testing/claude-ux-gate.md` - Claude UX Gate 규격
- `playbook/03-dev-environment/ux-gate-claude-code-guide.md` - UX Gate Claude Code 사용 가이드

---

### 3. 프론트/백/DB 연결 검증 (프론트 기준 반영 확인)

```
[FRONTEND VERIFICATION]

현재 프로젝트의 모든 프론트엔드 탭/페이지를 순회하며:

1. 각 탭/페이지 접근 확인
2. 레이어별 데이터 확인:
   - API 레이어 (API 호출 성공 여부)
   - 상태 관리 레이어 (Redux/Zustand/Context)
   - 비즈니스 로직 레이어 (데이터 변환/처리)
   - UI 레이어 (화면 표시)
3. 데이터 플로우 검증 (입력 → 처리 → 출력)
4. 화면별 데이터 표시 검증:
   - 리스트/그리드
   - 상세 화면
   - 폼
   - 대시보드
5. 예외 상황 확인:
   - 빈 데이터
   - 로딩 상태
   - 에러 상태

각 항목별로:
- ✅ 정상
- ⚠️ 확인 필요
- ❌ 문제 발견

형태로 결과를 정리해줘.

참고 문서:
- $AI_SYSTEM/playbook/07-frontend/frontend-verification-routine.md
```

**참고 문서:**
- `playbook/07-frontend/frontend-verification-routine.md` - 프론트엔드 검증 루틴
- `playbook/09-routines-guides/case-by-case-guide.md` - 케이스별 가이드 (3번)

---

### 4. 기능 오류 해결 (디버깅)

#### 방법 1: 자동 실행 (테스트 실패 시)
```
테스트 실패했어.
```
→ `healer-automation` Skill 자동 실행

#### 방법 2: Healer Agent 사용
```
@healer
테스트 실패 분석해줘.
- Test ID: TC-001-user-login-flow
- 실패 단계: Step 3 - Click login button
- 에러: LocatorNotFoundError
```

#### 방법 3: Debug Command 사용
```
/debug
[에러 메시지 또는 문제 설명]
```

**참고 문서:**
- `playbook/02-qa-testing/healer-automation-guide.md` - Healer 자동화 가이드
- `agents/15_agent_healer.md` - Healer Agent 정의

---

## 🚀 통합 사용 시나리오

### 시나리오 1: 구현 완료 후 전체 검증
```
구현 완료! QA 검증해줘.
```
→ 자동 실행:
1. TestGen (테스트 생성)
2. UX Gate (UX 검증)
3. Antigravity E2E (DOM 자동화)
4. Healer (실패 시)
5. Security Tests
6. TestOps
7. QA Judge

### 시나리오 2: UX만 빠르게 확인
```
/ux-gate
로그인 페이지 UX 검증해줘.
```

### 시나리오 3: 프론트엔드 데이터 연결 확인
```
[FRONTEND VERIFICATION]
모든 탭/페이지에서 데이터가 올바르게 표시되는지 확인해줘.
```

### 시나리오 4: 테스트 실패 시 자동 해결
```
테스트 실패했어.
```
→ Healer 자동 실행 → 원인 분석 → 수정 제안

---

## 📚 관련 문서

- `playbook/09-routines-guides/qa-ux-frontend-debug-guide.md` - QA/UX/프론트엔드/디버깅 요청 가이드
- `playbook/02-qa-testing/integrated-qa-scenarios.md` - 통합 QA 실행 시나리오
- `playbook/02-qa-testing/claude-ux-gate.md` - Claude UX Gate 규격
- `playbook/07-frontend/frontend-verification-routine.md` - 프론트엔드 검증 루틴
- `playbook/02-qa-testing/healer-automation-guide.md` - Healer 자동화 가이드

---

**마지막 업데이트:** 2026-02-04
