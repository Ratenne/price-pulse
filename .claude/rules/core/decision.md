# Core Rules: Decision

## WHEN
- 신규 프로젝트 시작 여부를 판단할 때
- 기존 프로젝트를 계속/중단/보류로 재평가할 때

## DO
- Decision 없이 Execution 단계로 진입하지 않는다.
- GO/HOLD/KILL을 반드시 근거와 함께 출력한다.
- KILL 조건을 먼저 정의한 뒤 GO 가능성을 검토한다.

## DON'T
- 근거 없는 직관/감정으로 GO를 선언하지 않는다.
- Decision 결과 없이 개발 착수를 허용하지 않는다.

## CHECK
1. `docs/00_context.md` ~ `docs/04_solution.md` 존재 확인
2. 출력에 `[DECISION]`과 `[REASON]` 포함 여부 확인
3. HOLD/KILL인 경우 `추가 검증 질문` 제시 여부 확인

## 참고 (절차 SSOT)
- 상세 단계: `.claude/rules/workflow/decision-phase.md`
