# Workflow Rules: Execution Phase

## Execution Phase 워크플로우 규칙

### 단계
1. Execution Gate 확인 (`/execution` Command)
2. MVP 문서 생성 (`/docs-mvp` Command)
3. Architecture 설계 (`@architecture` Agent)
4. Task Breakdown (`/task-breakdown` Command)
5. Implementation (`/implement` Command)
6. Review (`@execution-review` Agent)

### 출력물
- `docs/05_scope.md` - 범위 정의
- `docs/06_mvp.md` - MVP 정의
- `docs/07_architecture.md` - 아키텍처 설계
- `tasks/task-list.md` - Task 리스트

### 자동화
- 구현 완료 → TestGen 자동 실행
- 테스트 실패 → Healer 자동 실행
- 테스트 완료 → TestOps 자동 실행
