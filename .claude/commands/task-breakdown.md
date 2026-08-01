# Task Breakdown — MVP를 Task로 분해

너는 **Task Breakdown Agent**다.

`docs/07_architecture.md`를 기반으로 MVP를 작은 Task 단위로 나눠줘.

---

## 입력 인자

- `INPUT: $ARGUMENTS`
- 권장 호출:
  - `/task-breakdown`
  - `/task-breakdown 결제 플로우 고도화`
- 인자가 있으면 해당 기능/범위를 우선 반영해 Task를 생성한다.

## 절대 규칙

- ❌ `docs/07_architecture.md` 없이 Task Breakdown 금지
- ❌ 각 Task는 1~3시간 내 완료 가능한 크기
- ❌ Task 간 의존성 명확히 표시

---

## 작업 수행

1. **docs/07_architecture.md 읽기**
   - 전체 플로우 파악
   - 데이터 단위 파악
   - 컴포넌트 책임 분리 확인

2. **Task 분해**
   - 각 Task는 독립적으로 구현 가능해야 함
   - Task ID 부여 (TASK-01, TASK-02, ...)
   - 의존성 명시

3. **Task 리스트 생성**
   - `tasks/task-list.md` 파일 생성
   - 우선순위 부여 (P0/P1/P2)

---

## 출력 형식

```markdown
# Task List

## TASK-01: [Task 제목]
- **Description:** [설명]
- **Dependencies:** 없음 / TASK-XX
- **Estimated Time:** [1-3시간]
- **Priority:** P0/P1/P2
- **Acceptance Criteria:**
  - [ ] [완료 기준 1]
  - [ ] [완료 기준 2]

## TASK-02: [Task 제목]
...
```

---

---

## 진행중인 프로젝트 TASK 정리

### 완료된 Task 정리 (진행중인 프로젝트)

진행중인 프로젝트의 경우, 먼저 완료된 기능을 Task로 정리:

```
현재 코드베이스를 분석해서 이미 구현된 기능들을 Task 형식으로 정리해줘.

각 기능마다:
- TASK ID 부여 (TASK-01, TASK-02, ...)
- 제목, 설명, 완료 기준, 관련 파일 명시
- 상태: ✅ 완료로 표시
```

### 남은 Task 생성

완료된 Task 정리 후, 남은 작업을 Task로 생성:

```
/task-breakdown
docs/06_mvp.md와 docs/07_architecture.md를 기반으로:
- 현재 구현된 기능 제외
- 남은 MVP 기능만 Task로 생성
- 각 Task는 1~3시간 단위
- 의존성 명시

tasks/task-list.md 파일을 생성/업데이트해줘.
완료된 Task와 남은 Task를 명확히 구분해줘.
```

**참고 문서:**
- `playbook/01-project-lifecycle/task-documentation-guide.md` - 진행중인 프로젝트 TASK 분리 및 문서화 가이드
- `playbook/03-dev-environment/ongoing-project-setup-guide.md` - 진행중인 프로젝트 정리 가이드 (2.5 Task 리스트 정리)

---

## 기능 추가 시 Task 생성

기존 프로젝트에 기능 추가 시:

```
/task-breakdown
[기능 설명] 기능을 추가하려고 해.
기존 tasks/task-list.md에 새 Task를 추가해줘.
```

**참고 문서:**
- `playbook/01-project-lifecycle/feature-addition-guide.md` - 기능 추가 가이드

---

**참고:** AI-SYSTEM의 `prompts/02_task_breakdown.md`와 `agents/05_agent_task_breakdown.md`를 참고하세요.
