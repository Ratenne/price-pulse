# Implement — 구현 시작

이 프로젝트는 **Implementation 단계**다.

---

## 입력 인자

- `INPUT: $ARGUMENTS`
- 권장 호출: `/implement TASK-001`
- 인자가 없으면 먼저 시작할 Task ID를 1회 질의한 뒤 진행한다.

## 절대 규칙

- ❌ `decision-lock.md` 없이 구현 시작 금지
- ❌ `tasks/task-list.md` 없이 구현 시작 금지
- ❌ Task ID 없이 구현 시작 금지

---

## 구현 시작 전 확인

1. **Decision Lock 확인**
   - `decision-lock.md` 파일 존재 확인
   - MVP 범위 고정 확인

2. **Task Breakdown 확인**
   - `tasks/task-list.md` 파일 존재 확인
   - Task ID 확인

3. **Architecture 확인**
   - `docs/07_architecture.md` 파일 존재 확인
   - 전체 플로우 확인

---

## 구현 시작

다음 형식으로 시작:

```
[IMPLEMENTATION START]
- Task ID: TASK-XX
- Task Description: [설명]
- Estimated Time: [예상 시간]
- Dependencies: [의존성]
```

---

## 구현 중 규칙

- ✅ Task 단위로 구현
- ✅ 3~5개 Task마다 Execution Review
- ✅ 구현 완료 시 [IMPLEMENTATION COMPLETE] 보고

---

**참고:** AI-SYSTEM의 `prompts/02_implementation_start.md`와 `prompts/02_implementation.md`를 참고하세요.
