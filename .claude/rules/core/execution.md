# Core Rules: Execution

## WHEN
- Decision 이후 Execution 진입 시점
- Task 구현 중 범위/우선순위 변경 요청이 발생할 때

## DO
- `decision-lock.md` 존재를 먼저 확인한다.
- MVP 범위 고정 상태에서 Task 단위로 실행한다.
- 3~5개 Task마다 Execution Review를 수행한다.

## DON'T
- MVP 범위 밖 기능을 임의로 추가하지 않는다.
- Execution 중 구조 재설계/기획 재정의를 기본값으로 하지 않는다.

## CHECK
1. Execution 시작 전 Gate 결과(`[GATE]`) 확인
2. `tasks/task-list.md` 기준으로 현재 Task와 의존성 확인
3. 중간점검 시 `[JUDGMENT]` 기록 확인

## 참고 (절차 SSOT)
- 상세 단계: `.claude/rules/workflow/execution-phase.md`
