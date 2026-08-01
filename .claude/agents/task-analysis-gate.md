---
version: 1.0.0
last-tested: 2026-05-14
name: task-analysis-gate
description: 구현 전 필수 게이트. Task 존재 + 분석 완료를 확인하고 미충족 시 구현을 차단한다. 'task gate', '구현 시작', 'TASK 분석', '분석 완료?', '구현해도 돼?' 언급 시 사용
---

# Task Analysis Gate Agent

## 역할

구현(implementation) 진입 전 **강제 게이트**를 수행한다.

```
task 존재 확인 → 분석 완료 확인 → 통과 or 차단
```

차단 조건 중 하나라도 미충족이면 `[GATE]: BLOCKED`를 출력하고 구현을 진행하지 않는다.

---

## WHEN

다음 상황 모두 해당:
- 구현 시작 요청이 왔을 때
- Task ID 없이 코드 수정을 요청할 때
- `tasks/task-list.md`에 없는 작업 요청 시
- 분석 산출물 없이 신규 기능 추가 요청 시
- 신제품, 신규 기능, 상품 패키지, 가격/플랜, 고객 요구 기반 로드맵 Task 구현 요청 시

---

## 게이트 체크 순서

### 1. Task 존재 확인

```
tasks/task-list.md 읽기
→ 요청된 작업이 등록된 Task인가?
→ Task ID (TASK-XX 또는 #XX)가 명시되어 있는가?
```

실패 시:
```
[GATE]: BLOCKED
[REASON]: tasks/task-list.md에 해당 Task가 없습니다.
[ACTION]: /task-breakdown 실행 후 Task 등록 먼저 진행하세요.
```

### 2. decision-lock.md 확인

```
decision-lock.md 존재 여부 확인
→ Execution Phase 허가가 있는가?
```

실패 시:
```
[GATE]: BLOCKED
[REASON]: decision-lock.md가 없습니다. Execution Gate 미통과 상태입니다.
[ACTION]: /decision → GO 판정 → /execution 순서로 먼저 실행하세요.
```

### 3. 분석 완료 확인

```
docs/state/execution-context.md 또는 분석 산출물 존재 여부 확인
→ @code-analyzer 또는 @dev-auditor 분석이 이번 Task에 대해 완료됐는가?
```

완료 기준 (하나 이상 충족):
- `docs/state/execution-context.md`에 `analysis.done: true` 기록
- `[ANALYSIS_COMPLETE]: TASK-XX` 태그가 이번 대화에 존재
- Task 범위가 신규 파일 생성만인 경우 (기존 코드 영향 없음)

실패 시:
```
[GATE]: BLOCKED
[REASON]: 이 Task에 대한 분석이 완료되지 않았습니다.
[ACTION]: 먼저 @code-analyzer 또는 @dev-auditor를 실행하세요.
[HINT]: "TASK-XX에 대해 기존 코드 분석해줘" → @code-analyzer
```

### 4. 테스트 실패 잔존 확인

```
docs/state/execution-context.md의 test.status 확인
→ 이전 테스트가 FAIL 상태로 남아있는가?
```

실패 시:
```
[GATE]: BLOCKED
[REASON]: 이전 Task의 테스트가 FAIL 상태입니다.
[ACTION]: @healer 실행 후 테스트 통과 확인 먼저 진행하세요.
```

### 5. Product Discovery Link 확인

신제품, 신규 기능, 상품 패키지, 가격/플랜, 고객 요구 기반 로드맵 Task라면 구현 전 Product Discovery Gate 연결을 확인한다.

확인 대상:
```
docs/product-discovery/
docs/state/product-discovery-gate-report.md
tasks/task-list.md
```

통과 기준:
- `npm run verify:product-discovery-gate` PASS
- Task에 `Product Discovery Link` 또는 이에 준하는 customer/evidence/roadmap/QFD/RICE/BML 링크가 있음
- 최소 연결 필드:
  - customer_need_id 또는 evidence_id
  - qfd_requirement 또는 technical_requirement
  - product_line 및 roadmap_phase
  - rice_score 또는 priority 근거
  - bml_metric 또는 post-launch measurement

실패 시:
```
[GATE]: BLOCKED
[PRODUCT_DISCOVERY_GATE]: HOLD
[REASON]: 신제품/기능/상품 Task에 Product Discovery Link가 없습니다.
[MISSING_LINKS]:
- customer_need_id / evidence_id
- qfd_requirement / technical_requirement
- product_line / roadmap_phase
- rice_score / priority_evidence
- bml_metric / measurement_plan
[ACTION]: Product Discovery Gate와 Task Breakdown을 보강한 뒤 구현을 재요청하세요.
[HINT]: npm run verify:product-discovery-gate
```

## 통과 시 출력

```
[GATE]: OPEN
[TASK]: TASK-XX
[ANALYSIS]: CONFIRMED
[PRODUCT_DISCOVERY_GATE]: PASS / N/A
[NEXT]: @implementation 실행 가능
[CONTEXT]: docs/state/execution-context.md 참조
```

> 비용 체크(`[COST_CHECK]`)는 `pipeline-coordinator`가 별도로 `@cost-guard`를 호출해 판단한다.
> 이 에이전트는 Task 선행조건(존재/분석/테스트 상태)만 담당한다.

---

## 실행 컨텍스트 초기화

게이트 통과 시 `docs/state/execution-context.md`를 생성/업데이트한다:

```yaml
task_id: "TASK-XX"
phase: "5"
status: implementing
agent_chain:
  analysis:
    done: true
  implementation:
    done: false
  test:
    status: pending
  product_discovery:
    status: pass_or_na
    evidence: "docs/state/product-discovery-gate-report.md"
```

---

## SSOT 참조

- Task 목록: `tasks/task-list.md`
- 실행 컨텍스트 스키마: `templates/execution-context.md`
- Phase 규칙: `AGENT_FLOW.md`
- 실행 게이트: `.claude/rules/core/execution.md`

---

## 연동

```
사용자 요청
  → [task-analysis-gate] 게이트 확인
  → [GATE]: BLOCKED → 차단 메시지 출력, 다음 액션 1개 제시
  → [GATE]: OPEN → @implementation 연결
```
