# Planner Review — 제품 기획 종합 리뷰

이 프로젝트는 **Planner Review 단계**다.

---

## 입력 인자

- `INPUT: $ARGUMENTS`
- 권장 호출:
  - `/planner-review`
  - `/planner-review full` — 전체 분석 (기본값)
  - `/planner-review sync` — Task 동기화만
  - `/planner-review features` — 기능 분석만

---

## 역할

서비스 기획 전문가 관점에서 다음을 수행한다:

1. 현재 Task 상태를 코드베이스 실제 파일과 대조하여 동기화
2. 개발본 ↔ 문서 일치 여부 점검
3. 타겟/가치 기준으로 필요 기능 구상 및 불필요 기능 식별
4. `docs/planner/` 기획 문서 생성 또는 업데이트

---

## 실행 프로세스

### Step 1: 현황 파악

다음 파일을 순서대로 확인한다:

1. `tasks/task-list.md` — 현재 Task 목록 및 상태
2. `docs/planner/00-index.md` — 기존 기획 문서 존재 여부
3. `git log --oneline -20` — 최근 커밋으로 실제 완료 작업 파악
4. `docs/internal/` 최신 문서 — 코드 리뷰, 운영 설계 등

출력:
```
[PLANNER_REVIEW]: START
[SCOPE]: full / sync / features
[CURRENT_STATUS]:
- 완료된 실제 작업: [목록]
- task-list 미반영 항목: [목록]
- Pending Task: [목록]
```

---

### Step 2: Task 동기화

`tasks/task-list.md`의 각 Task를 실제 파일 존재 여부와 DoD 기준으로 검증한다.

**검증 방법:**
- DoD에 명시된 산출물 파일이 실제 존재하는지 확인
- git log에서 관련 커밋 근거 확인
- 불일치 시 상태 수정

출력:
```
[TASK_SYNC]:
- 변경: #XX [이전 상태] → [새 상태] (근거: [파일/커밋])
- 유지: #XX [상태] (근거: [확인 내용])
- 미결: #XX DoD 미충족 항목: [파일명]
```

---

### Step 3: 개발본 ↔ 문서 일치 점검

다음을 확인한다:

- task-list DoD에 약속된 파일 vs 실제 존재 파일
- 실제 구현됐지만 문서에 없는 스크립트/기능
- docs/planner/04-doc-code-alignment.md 업데이트

출력:
```
[DOC_CODE_ALIGNMENT]:
- 일치: [항목 수]
- 불일치: [항목 목록]
- 문서 미작성 구현: [항목 목록]
```

---

### Step 4: 기획 분석 (features 모드 또는 full 모드)

서비스 기획 전문가 관점에서 다음을 수행한다:

#### 4-A: 타겟/가치 기준 필요 기능 구상
- `docs/planner/01-product-vision.md`의 Persona A/B/C 기준
- 현재 있는 기능 vs 막히는 지점
- 신규 기능 제안 (우선순위 포함)

#### 4-B: 불필요 기능 식별
- MVP 가치 제안과 무관한 구현
- 중복 문서/스크립트
- 과잉 에이전트/기능

출력:
```
[FEATURE_ANALYSIS]:
[NEEDED]:
- [기능명]: [근거 — 어느 Persona가 막히는가]

[UNNECESSARY]:
- [항목]: [판단 — 제거/보류/단순화]
```

---

### Step 5: docs/planner/ 업데이트

분석 결과를 기준으로 다음 파일을 생성 또는 업데이트한다:

| 파일 | 조건 |
|------|------|
| `docs/planner/00-index.md` | 항상 업데이트 |
| `docs/planner/02-feature-roadmap.md` | 신규 기능 제안 있을 때 |
| `docs/planner/03-unnecessary-features.md` | 불필요 항목 발견 시 |
| `docs/planner/04-doc-code-alignment.md` | 불일치 발견 시 |
| `docs/planner/05-open-questions.md` | 미결 질문 추가 시 |

---

## 최종 출력 형식

```
[PLANNER_REVIEW_REPORT]

## Task 동기화
- 변경: [건수]
- 내용: [목록]

## 개발본 ↔ 문서
- 불일치: [건수]
- 내용: [목록]

## 기획 분석
- 신규 기능 제안: [건수]
- 불필요 기능: [건수]

## 업데이트된 문서
- [파일 목록]

## 다음 우선순위 Action (1개)
[NEXT]: [가장 중요한 다음 행동]
[REASON]: [근거]
```

---

## 금지 사항

- ❌ 코드 직접 수정 (문서와 task-list만 수정)
- ❌ MVP 범위 밖 기능을 task-list에 임의 추가
- ❌ 근거 없는 기능 제안 (반드시 Persona/가치 기준 명시)
- ❌ 한 번에 전체 리빌드 제안 (점진적 개선만)

---

## 참고 문서

- `docs/planner/` — 기획 문서 SSOT
- `tasks/task-list.md` — Task 기준
- `.claude/rules/core/execution.md` — MVP 범위 고정 원칙
- `docs/channels/` — 채널별 타겟 정의
