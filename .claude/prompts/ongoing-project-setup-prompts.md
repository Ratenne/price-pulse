# 진행 중인 프로젝트 정리 프롬프트 모음

> 각 단계별로 복사해서 바로 사용할 수 있는 프롬프트 템플릿

**작성일:** 2026-02-04
**용도:** Claude Code에서 복사해서 바로 사용

---

## Step 1: 프로젝트 전체 분석

```
이 프로젝트의 전체 구조를 분석해줘.

다음 파일들을 읽어서 참고해줘:
- $AI_SYSTEM/OPERATION.md
- $AI_SYSTEM/AGENT_FLOW.md

분석 항목:
1. 주요 디렉토리 구조
2. 핵심 파일 및 모듈
3. 기술 스택 및 의존성
4. 현재 구현된 기능 목록
5. 아키텍처 패턴

출력 형식:
- 구조 요약
- 구현된 기능 목록 (기능명, 관련 파일, 상태)
- 기술 스택
```

---

## Step 1: Git 히스토리 분석

```
커밋 히스토리를 분석해줘.

분석 항목:
1. 개발 진행 상황 (주요 마일스톤)
2. 주요 변경사항 (기능 추가, 리팩토링 등)
3. 현재 상태 요약

출력 형식:
- 개발 타임라인
- 주요 변경사항 요약
- 현재 상태 평가
```

---

## Step 2: 문서 상태 확인

```
현재 프로젝트의 문서 상태를 확인해줘.

확인 항목:
1. docs/ 폴더 구조 확인
2. 각 문서의 존재 여부 (docs/00~08.md)
3. 각 문서의 내용 요약
4. 누락된 문서 목록

출력 형식:
- 문서 존재 여부 표 (✅/❌)
- 각 문서 내용 요약
- 누락된 문서 목록
```

---

## Step 2: MVP 문서 생성

```
/docs-mvp

현재 코드베이스를 기반으로 MVP 문서를 생성해줘.

다음 파일들을 읽어서 참고해줘:
- $AI_SYSTEM/templates/project_docs/05_scope.md
- $AI_SYSTEM/templates/project_docs/06_mvp.md
- $AI_SYSTEM/templates/project_docs/07_metrics.md
- $AI_SYSTEM/templates/project_docs/08_risks.md

생성할 문서:
- docs/05_scope.md - 하지 않을 것
- docs/06_mvp.md - 현재 구현된 MVP 기능
- docs/07_metrics.md - 성공 기준
- docs/08_risks.md - 리스크 및 대응
```

---

## Step 2: Architecture 문서 생성

```
@architecture

현재 코드베이스를 분석해서 아키텍처 문서를 생성해줘.

다음 파일들을 읽어서 참고해줘:
- $AI_SYSTEM/agents/04_agent_architecture.md
- $AI_SYSTEM/playbook/01-project-lifecycle/architecture.md

입력:
- docs/06_mvp.md (현재 구현된 MVP)
- 현재 코드베이스 구조

출력:
- docs/07_architecture.md

포함 내용:
- 전체 플로우 정의
- 데이터 단위 정의
- 컴포넌트 책임 분리
```

---

## Step 3: 완료된 Task 정리

```
현재 코드베이스를 분석해서 이미 구현된 기능들을 Task 형식으로 정리해줘.

다음 파일들을 읽어서 참고해줘:
- $AI_SYSTEM/agents/05_agent_task_breakdown.md
- $AI_SYSTEM/playbook/01-project-lifecycle/task_breakdown.md

요구사항:
1. 각 구현된 기능마다 TASK ID 부여 (TASK-01, TASK-02, ...)
2. 제목, 설명, 완료 기준, 관련 파일 명시
3. 상태: ✅ 완료로 표시

출력 형식:
## ✅ 완료된 Task

### TASK-01: [구현된 기능명]
- **Description:** [구현된 기능 설명]
- **Status:** ✅ 완료
- **Completed Files:**
  - [파일 경로 1]
  - [파일 경로 2]
- **Completed Criteria:**
  - [x] [구현된 내용 1]
  - [x] [구현된 내용 2]

출력만 해주고, 파일은 아직 생성하지 마세요.
```

---

## Step 3: 남은 Task 생성

```
/task-breakdown

docs/06_mvp.md와 docs/07_architecture.md를 기반으로 남은 작업을 Task로 생성해줘.

다음 파일들을 읽어서 참고해줘:
- $AI_SYSTEM/agents/05_agent_task_breakdown.md
- $AI_SYSTEM/.claude/commands/task-breakdown.md

요구사항:
1. 현재 구현된 기능은 제외
2. 남은 MVP 기능만 Task로 생성
3. 각 Task는 1~3시간 단위
4. 의존성 명시
5. 완료 기준 명확히

출력:
- tasks/task-list.md 파일 생성

파일 구조:
# Task List

## ✅ 완료된 Task
[TASK-01 ~ TASK-N] (이전에 정리한 완료된 Task)

## 📋 남은 Task
[TASK-N+1 ~ TASK-M] (새로 생성)

각 Task 형식:
### TASK-XX: [작업 제목]
- **Description:** [구체적 작업 내용]
- **Status:** 📋 대기
- **Dependencies:** 없음 / TASK-XX
- **Estimated Time:** [1-3시간]
- **Priority:** P0/P1/P2
- **Acceptance Criteria:**
  - [ ] [완료 기준 1]
  - [ ] [완료 기준 2]
- **Files to Change:**
  - [예상 파일 경로 1]
  - [예상 파일 경로 2]
```

---

## Step 4: 테스트 상태 확인

```
현재 프로젝트의 테스트 상태를 분석해줘.

확인 항목:
1. tests/ 폴더 구조 확인
2. E2E 테스트 존재 여부 (tests/e2e/)
3. 단위 테스트 존재 여부
4. 테스트 실행 가능 여부
5. 테스트 실행 결과 (가능한 경우)

출력 형식:
- 테스트 구조 요약
- 테스트 파일 목록
- 테스트 실행 결과 (성공/실패)
- 테스트 커버리지 (가능한 경우)
```

---

## Step 4: QA 자동화 루프 확인

```
AI-SYSTEM의 QA 자동화 루프 상태를 확인해줘.

다음 파일들을 읽어서 참고해줘:
- $AI_SYSTEM/agents/14_agent_testgen.md
- $AI_SYSTEM/agents/15_agent_healer.md
- $AI_SYSTEM/agents/16_agent_testops.md
- $AI_SYSTEM/OPERATION.md (Step 6.5, 6.8, 7 참조)

확인 항목:

1. TestGen 자동화 루프
   - tests/e2e/regression/ 폴더 존재 여부
   - .claude/agents/testgen.md 또는 .claude/skills/testgen-automation/ 설정 여부
   - 자동 트리거 메커니즘 확인

2. Self-Healing (Healer)
   - .claude/agents/healer.md 또는 .claude/skills/healer-automation/ 설정 여부
   - 테스트 실패 시 자동 분석 설정 여부

3. TestOps 대시보드
   - .claude/skills/testops-automation/ 설정 여부
   - 테스트 결과 수집 메커니즘 확인

4. E2E 테스트
   - Playwright 설정 확인
   - Antigravity 설정 확인 (있는 경우)

5. CI 게이트
   - CI/CD 설정 확인 (.github/workflows/ 또는 .gitlab-ci.yml)
   - PR 게이트 설정 확인

각 항목별로:
- 현재 상태: ✅ 자동화됨 / ⚠️ 수동만 가능 / ❌ 없음
- 설정 파일 위치
- 개선 필요 여부
```

---

## Step 5: 개선 포인트 분석

```
AI-SYSTEM의 6가지 개선 포인트 기준으로 현재 프로젝트 상태를 분석해줘.

다음 파일들을 읽어서 참고해줘:
- $AI_SYSTEM/playbook/08-analysis-review/implementation-status-review.md
- $AI_SYSTEM/playbook/08-analysis-review/qa-improvement-checklist.md

분석 항목:

1. TestGen 자동화 루프
   - 현재 상태: ✅ 자동화됨 / ⚠️ 수동만 가능 / ❌ 없음
   - 개선 필요 여부
   - 우선순위 (P0/P1/P2)

2. Self-Healing (Healer)
   - 현재 상태: ✅ 자동화됨 / ⚠️ 수동만 가능 / ❌ 없음
   - 개선 필요 여부
   - 우선순위 (P0/P1/P2)

3. TestOps 대시보드
   - 현재 상태: ✅ 대시보드 있음 / ⚠️ 부분적 / ❌ 없음
   - 개선 필요 여부
   - 우선순위 (P0/P1/P2)

4. API/권한 레이어
   - 현재 상태: ✅ Contract Test 있음 / ⚠️ 부분적 / ❌ 없음
   - 개선 필요 여부
   - 우선순위 (P0/P1/P2)

5. Shift-Left
   - 현재 상태: ✅ Claude UX Gate 통합됨 / ⚠️ 부분적 / ❌ 없음
   - 개선 필요 여부
   - 우선순위 (P0/P1/P2)

6. CI 게이트 성숙도
   - 현재 상태: ✅ PR 게이트 설정됨 / ⚠️ 부분적 / ❌ 없음
   - 개선 필요 여부
   - 우선순위 (P0/P1/P2)

출력 형식:
## 개선 포인트 분석 결과

### P0 (당장 해야 할 것)
- [ ] 항목 1: [현재 상태] → [개선 방법]
- [ ] 항목 2: [현재 상태] → [개선 방법]

### P1 (4주 이내)
- [ ] 항목 3: [현재 상태] → [개선 방법]

### P2 (안정화)
- [ ] 항목 4: [현재 상태] → [개선 방법]

각 항목별로:
- 현재 상태 요약
- 개선 방법 (참고 문서 기반)
- 예상 시간
- 참고 문서 경로
```

---

**마지막 업데이트:** 2026-02-04
