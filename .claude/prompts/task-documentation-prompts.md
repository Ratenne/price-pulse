# 진행중인 프로젝트 TASK 문서화 프롬프트

> 진행중인 프로젝트의 TASK를 체계적으로 분리하고 문서화하기 위한 프롬프트 모음

**작성일:** 2026-02-04
**목적:** 진행중인 프로젝트의 TASK 정리 및 문서화를 위한 재사용 가능한 프롬프트 제공

---

## 📋 프롬프트 목록

### 1. 완료된 Task 정리

```
현재 코드베이스를 분석해서 이미 구현된 기능들을 Task 형식으로 정리해줘.

요구사항:
1. 각 구현된 기능마다 TASK ID 부여 (TASK-01, TASK-02, ...)
2. 제목, 설명, 완료 기준, 관련 파일 명시
3. 상태: ✅ 완료로 표시
4. docs/07_architecture.md의 플로우 단계와 연결 (있는 경우)

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
- **Flow Step:** [docs/07_architecture.md의 플로우 단계] (있는 경우)
- **Data Unit:** [다루는 데이터 단위] (있는 경우)

### TASK-02: [구현된 기능명]
...

참고 문서:
- $AI_SYSTEM/playbook/01-project-lifecycle/task-documentation-guide.md
- $AI_SYSTEM/agents/05_agent_task_breakdown.md
```

---

### 2. 남은 Task 생성

```
/task-breakdown

docs/06_mvp.md와 docs/07_architecture.md를 기반으로:
- 현재 구현된 기능 제외
- 남은 MVP 기능만 Task로 생성
- 각 Task는 1~3시간 단위
- 의존성 명시
- 완료 기준 명확히

tasks/task-list.md 파일을 생성/업데이트해줘.

파일 구조:
# Task List

## ✅ 완료된 Task
[TASK-01 ~ TASK-N] (이전에 정리한 완료된 Task)

## 🔄 진행 중인 Task (있는 경우)
[TASK-X]

## 📋 남은 Task
[TASK-N+1 ~ TASK-M] (새로 생성)

각 Task 형식:
### TASK-XX: [작업 제목]
- **Description:** [작업 설명]
- **Dependencies:** 없음 / TASK-XX
- **Estimated Time:** [1-3시간]
- **Priority:** P0/P1/P2
- **Flow Step:** [docs/07_architecture.md의 플로우 단계]
- **Input Data:** [입력 데이터 단위]
- **Output Data:** [출력 데이터 단위]
- **Next Step:** [다음 플로우 단계]
- **Acceptance Criteria:**
  - [ ] [완료 기준 1]
  - [ ] [완료 기준 2]
- **Expected Files:**
  - [예상 변경 파일 1]
  - [예상 변경 파일 2]

참고 문서:
- $AI_SYSTEM/playbook/01-project-lifecycle/task-documentation-guide.md
- $AI_SYSTEM/agents/05_agent_task_breakdown.md
- $AI_SYSTEM/.claude/commands/task-breakdown.md
```

---

### 3. 기능 추가 시 Task 생성

```
/task-breakdown

[기능 설명] 기능을 추가하려고 해.

기존 tasks/task-list.md를 참고해서:
- 새 Task를 추가
- 기존 Task와의 의존성 확인
- 각 Task는 1~3시간 단위
- 완료 기준 명확히

tasks/task-list.md 파일을 업데이트해줘.

참고 문서:
- $AI_SYSTEM/playbook/01-project-lifecycle/feature-addition-guide.md
```

---

### 4. Architecture 업데이트 후 Task 재생성

```
@architecture
[기능 설명] 기능을 추가하려고 해.
기존 docs/07_architecture.md를 참고해서 업데이트해줘.

그 다음:

/task-breakdown
업데이트된 docs/07_architecture.md를 참고해서:
- 기존 Task 리스트 확인
- 새 Task 추가 또는 기존 Task 업데이트
- 각 Task는 1~3시간 단위
- 의존성 명시

tasks/task-list.md 파일을 업데이트해줘.

참고 문서:
- $AI_SYSTEM/playbook/01-project-lifecycle/feature-addition-guide.md
- $AI_SYSTEM/playbook/01-project-lifecycle/task-documentation-guide.md
```

---

## 🚀 사용 시나리오

### 시나리오 1: 코드만 있는 프로젝트

**Step 1: 완료된 Task 정리**
```
현재 코드베이스를 분석해서 이미 구현된 기능들을 Task 형식으로 정리해줘.
[위 프롬프트 1 사용]
```

**Step 2: MVP 및 Architecture 생성**
```
/docs-mvp
현재 코드베이스를 기반으로 MVP 문서 생성해줘.

@architecture
현재 코드베이스를 분석해서 아키텍처 문서 생성해줘.
```

**Step 3: 남은 Task 생성**
```
[위 프롬프트 2 사용]
```

---

### 시나리오 2: 부분 진행된 프로젝트

**Step 1: 완료된 Task 정리**
```
[위 프롬프트 1 사용]
```

**Step 2: 남은 Task 생성/업데이트**
```
[위 프롬프트 2 사용]
```

---

### 시나리오 3: 기능 추가

**Case 1: Architecture 업데이트 불필요**
```
[위 프롬프트 3 사용]
```

**Case 2: Architecture 업데이트 필요**
```
[위 프롬프트 4 사용]
```

---

## 📚 관련 문서

- `playbook/01-project-lifecycle/task-documentation-guide.md` - 진행중인 프로젝트 TASK 분리 및 문서화 가이드
- `playbook/01-project-lifecycle/feature-addition-guide.md` - 기능 추가 가이드
- `playbook/03-dev-environment/ongoing-project-setup-guide.md` - 진행중인 프로젝트 정리 가이드
- `agents/05_agent_task_breakdown.md` - Task Breakdown Agent 정의
- `.claude/commands/task-breakdown.md` - Task Breakdown Command

---

**마지막 업데이트:** 2026-02-04
