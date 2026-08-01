# Agent Contract Registry

> **Legacy reference view**: 판매 제품의 현재 파일 집합은 `registry/asset_capability_index.generated.yaml`과 실제 `agents/`가 정본이다. 이 문서는 이전 계약 설명을 보존하며, 파생 빌드에서 제외된 agent를 다시 적재하는 근거로 사용하면 안 된다.

> SSOT: 에이전트 간 입출력 태그 계약 정의
> 갱신: 에이전트 추가/수정 시 반드시 이 파일 동기화
> 목적: 미소비 태그 · 순환 호출 · 중복 역할 조기 탐지
> Version fields: every agent frontmatter must include `version` and `last-tested`.

---

## Agent Version Metadata Contract

Every agent markdown file under `.claude/agents/*.md` and `enterprise/library/agents/*.md` must include the following YAML frontmatter fields:

```yaml
version: 1.0.0
last-tested: YYYY-MM-DD
```

Rules:

- `version` follows semver-style `MAJOR.MINOR.PATCH`.
- `last-tested` is the latest local contract verification date.
- Any agent output contract change must update `version`.
- Any verifier or harness run that covers the agent may update `last-tested`.
- `CONTRACT_REGISTRY.md` changes must be reviewed with the affected agent files.

Verification:

```bash
npm run verify:agent-version-metadata
```

---

## 레이어별 에이전트 계약

### L1 — Router / Orchestrator

| 에이전트 | Input Tags (소비) | Output Tags (생성) | Consumers | Failure |
|---------|------------------|--------------------|-----------|---------|
| `project-router` ⭐⭐⭐ (D-50) | "지침에 따라 [프로젝트]" 트리거 / business_wiki/[프로젝트]/00_AI_ENTRY.md | `[PROJECT_ROUTER]` (3 영역 분류) | 사업·개발·마케팅 영역별 chain | HOLD + 영역 명시 안내 |
| `pipeline-coordinator` | `[FAST_TRACK]`, `[COST_CHECK]`, `[GATE]`, `[JUDGMENT]` | `[PIPELINE_COORDINATOR]`, `[PHASE_TRANSITION]` | on-response.sh | HOLD + 누락 항목 안내 |
| `execution-manager` | `[GATE]: OPEN`, decision-lock.md 존재 | `[GATE]: OPEN/HOLD`, `[VALUE]: PASS/HOLD`, `[RESOURCE]: PASS/HOLD` | pipeline-coordinator | HOLD + 이유 |
| `channel-router` ⭐⭐ (D-50 / 마케팅 4단계) | `[MARKETING_CONTEXT]` + `[FUNNEL_DESIGN]` + `[MARKETING_STRATEGY]` | `[CHANNELS_SELECTED]` (글로벌 16+ 동적) | content-* 채널별 | 부분 산출 + 모순 명시 |

---

### L2 — Gate / 선행조건 판정

| 에이전트 | Input Tags (소비) | Output Tags (생성) | Consumers | Failure |
|---------|------------------|--------------------|-----------|---------|
| `task-analysis-gate` | 사용자 구현 요청, `tasks/task-list.md` | `[GATE]: OPEN/BLOCKED`, `[TASK]`, `[ANALYSIS]` | `/implement`, `@implementation` | BLOCKED + ACTION 1개 |
| `cost-guard` | 실행 예정 에이전트 목록 | `[COST_CHECK]: PASS/WARN/HOLD` | `pipeline-coordinator`, `task-analysis-gate` | HOLD + 절감 대안 |
| `decision` | `docs/00~04.md` | `[DECISION]: GO/HOLD/KILL`, `[REASON]` | on-response.sh → decision-lock.md 생성 | HOLD + 검증 질문 1개 |

---

### L3 — Context / 분석 (읽기 전용)

| 에이전트 | Input Tags (소비) | Output Tags (생성) | Consumers | Failure |
|---------|------------------|--------------------|-----------|---------|
| `code-analyzer` | Task ID, 파일 경로 | `[PROJECT ANALYSIS]`, `[TASK ANALYSIS]`, `[CHANGES ANALYSIS]`, `[DEPENDENCY ANALYSIS]` | `task-analysis-gate`, `@implementation` | ERROR + 파일 경로 |
| `dev-auditor` | 코드베이스 | `[DEV_AUDIT_RESULT]`, `[TECH_DEBT]` | `@execution-review` | ERROR + 재시도 |
| `product-diagnosis` | 프로젝트 전체 | `[PRODUCT_DIAGNOSIS]`, `[BUSINESS_HEALTH]`, `[DESIGN_HEALTH]`, `[OVERALL]` | 사용자 직접 소비 | ERROR 보고 |
| `data-analyst` | CSV/JSONL/JSON | `[DATA_ANALYSIS]` | `@business-impact-prioritizer` | ERROR + 파일 형식 확인 |
| `spec-implementation-verifier` | docs + src/app | `[SPEC_IMPLEMENTATION_VERIFICATION]`, `[SPEC_BASELINE]`, `[IMPLEMENTATION_SNAPSHOT]` | `@business-impact-prioritizer`, `@pre-launch-final-auditor` | PARTIAL/FAIL + Gap Task |
| `target-value-uiux-auditor` | docs Target/Value + Web/App 구현 | `[TARGET_VALUE_UIUX_AUDIT]`, `[SCORECARD]` | `@business-impact-prioritizer`, `@pre-launch-final-auditor` | MISFIT + 개선 Task |
| `hypothesis-mapper` | docs + 개발본 | `[HYPOTHESIS_MAP]`, `[HYPOTHESIS_INVENTORY]` | `@growth-loop-designer`, `@business-impact-prioritizer` | ERROR + 근거 부족 |
| `business-visualization-architect` | docs + 개발본 | `[BUSINESS_VISUALIZATION]`, `[DIAGRAM_PLAN]` | `@sales-ir-material-converter`, 사용자 직접 소비 | ERROR + 누락 근거 |
| `sales-ir-material-converter` | 사업/제품/기술 문서 | `[SALES_IR_MATERIAL]`, `[DECK_STRUCTURE]` | 사용자 직접 소비 | MISSING_EVIDENCE |
| `proposal-orchestrator` | 공고/RFP/신청서 원문 + 마스터 사업계획서/회사 근거 | `[PROPOSAL_PIPELINE]`, `[REVIEW]`, `[PROPOSAL_ARTIFACTS]` | 사용자 직접 소비, `@proposal-reviewer`, `@business-visualization-architect` | HOLD + 누락 원문/근거 요청 |
| `proposal-reviewer` | 제안서/사업계획서 초안 + 근거 자료 | `[PROPOSAL_REVIEW]`, `[VERDICT_OVERALL]` | `@proposal-orchestrator`, `@proposal-enhance` | CONDITIONAL/FAIL + 보강 TOP 3 |
| `reviewer-new-biz` | 제안서/전략 문서 | `[REVIEW_NEW_BIZ]`, `[VERDICT_NEW_BIZ]` | `@proposal-reviewer` | FAIL + 신사업 리스크 |
| `reviewer-vc` | 제안서/IR/전략 문서 | `[REVIEW_VC]`, `[VERDICT_VC]` | `@proposal-reviewer` | PASS + 재검토 조건 |
| `reviewer-pmpo` | 제품/서비스 전략 문서 | `[REVIEW_PMPO]`, `[VERDICT_PMPO]` | `@proposal-reviewer` | RETHINK + 다음 실험 |
| `reviewer-public` | 정부지원사업/공공 제안서 | `[REVIEW_PUBLIC]`, `[VERDICT_PUBLIC]` | `@proposal-reviewer` | REJECT + 보완 조건 |

---

### L4 — Execution / 파일 생성·수정

| 에이전트 | Input Tags (소비) | Output Tags (생성) | Consumers | Failure |
|---------|------------------|--------------------|-----------|---------|
| `implementation` | `[GATE]: OPEN`, Task ID | `[IMPLEMENTATION COMPLETE]` | on-response.sh → testgen-automation | ERROR + 롤백 안내 |
| `testgen` | `[IMPLEMENTATION_COMPLETE]` | `[TESTGEN_COMPLETE]: TASK-XX` | 테스트 실행 → `[TEST_RESULT]` | ERROR + 수동 테스트 요청 |
| `healer` | `[TEST_RESULT]: FAIL` | `[HEALER_DIAGNOSIS]`, `[HEALER_ESCALATE]` | @implementation (수정 재시도) | `[HEALER_ESCALATE]` → 수동 |
| `deployment` | `[JUDGMENT]: 종료` / `[DEPLOYMENT_COMPLETE]` | `[DEPLOYMENT CHECKLIST]`, `[READY TO DEPLOY]`, `[NOT READY]` | on-response.sh → post-deploy 스킬 | HOLD + 체크리스트 |
| `pre-launch-final-auditor` | 리뷰/검증 리포트 + 개발본 | `[PRE_LAUNCH_FINAL_AUDIT]`, `[RELEASE_BLOCKERS]` | 사용자 직접 소비, `@deployment` | NO_GO/CONDITIONAL_GO + P0 |
| `architecture` | `decision-lock.md`, `docs/05~06.md` | `[ARCHITECTURE_COMPLETE]` | pipeline-coordinator → Phase 3.5 완료 | ERROR + 입력 문서 확인 |
| `task-breakdown` | `docs/07_architecture.md` | `[TASK_BREAKDOWN_COMPLETE]`, `tasks/task-list.md` | pipeline-coordinator → Phase 5 완료 | ERROR + architecture.md 확인 |
| `git-helper` | 커밋 요청 | `[COMMIT GATE]`, `[COMMIT HOLD]`, `[COMMIT MESSAGE]` | release-ops-bridge 스킬 | HOLD + GATE 항목 명시 |

---

### L5 — Skills / 자동 트리거

| 스킬 | 트리거 | Output Tags | Downstream |
|------|--------|-------------|-----------|
| `testgen-automation` | `[IMPLEMENTATION_COMPLETE]` | `[TESTGEN_COMPLETE]` | 테스트 실행 |
| `healer-automation` | `[TEST_RESULT]: FAIL` | `[HEALER_COMPLETE]` / `[HEALER_ESCALATE]` | @implementation |
| `ux-gate-automation` | `[TEST_RESULT]: PASS` | `[UX_GATE]: PASS/HOLD` | code-review-automation |
| `code-review-automation` | `[UX_GATE]: PASS` | `[CODE_REVIEW_COMPLETE]` / `[TASK_COMPLETE]` | on-response.sh |
| `release-ops-bridge` | "커밋하고 배포해", `[JUDGMENT]: 종료` | `[RELEASE_OPS_BRIDGE]`, `[DEPLOYMENT_COMPLETE]` | post-deploy 스킬 |
| `idea-to-deploy` | "아이디어가 있어", "새 프로젝트" | `[IDEA_TO_DEPLOY]` | Phase별 에이전트 |
| `post-deploy` | `[DEPLOYMENT_COMPLETE]` | `[POST_DEPLOY]`, `[INCIDENT_FLOW]` / `[FEEDBACK_FLOW]` / `[GROWTH_FLOW]` | 3분기 에이전트 체인 |
| `cost-guard-automation` | S/A 등급 에이전트 호출 전 | `[COST_CHECK]` | pipeline-coordinator |
| `proposal-redesign-intake` | 기존 PPT/PDF/DOCX 리디자인 입력 | `[PROPOSAL_REDESIGN_INTAKE]` | style-variant-router, deck-design-system-capsule |
| `style-variant-router` | RFP 도메인 기반 getdesign.md 스타일 후보 추천 | `[STYLE_VARIANT_ROUTER]` | deck-design-system-capsule |
| `deck-design-system-capsule` | RFP-to-Deck 디자인 시스템 고정 | `[DECK_DESIGN_SYSTEM_CAPSULE]` | one-slide-calibration-gate |
| `one-slide-calibration-gate` | 전체 PPTX 생성 전 대표 슬라이드 검수 | `[DESIGN_CALIBRATION]` | section-generate, pptx-editable-chart-contract |
| `native-pptx-chart-helper` | 수정 가능한 PPT chart/table/shape wrapper 생성 | `[NATIVE_PPTX_CHART_HELPER]` | pptx-editable-chart-contract |
| `pptx-editable-chart-contract` | 데이터 시각물 생성/검수 | `[EDITABLE_CHART_CONTRACT]` | deck-visual-qa |
| `deck-visual-qa` | 완성 PPTX/PDF 렌더 기반 시각 QA | `[DECK_VISUAL_QA]` | revision-loop, final-export |

---

### Enterprise Track — Pilot 모듈 (4개)

> SSOT: `enterprise/AGENTS.md` Pilot 섹션
> 트리거: CLAUDE.md Enterprise Track 라우팅 E1~E4

| 에이전트 | Input Tags (소비) | Output Tags (생성) | Consumers | Failure |
|---------|------------------|--------------------|-----------|---------|
| `enterprise-readiness` | "도입 준비도", "Day0 점수", "파일럿 시작 전" | `[READINESS_SCORE]` | E2 진입 조건 체크 → `enterprise-security-pack` | HOLD + 준비도 점수 |
| `enterprise-security-pack` | `[READINESS_SCORE]` ≥ CONDITIONAL | `[SECURITY_VERDICT]: CLEARED/BLOCKED` | E3 진입 조건 체크 → `enterprise-pilot-manager` | BLOCKED + 미충족 항목 |
| `enterprise-pilot-manager` | `[SECURITY_VERDICT]: CLEARED` + `[KPI_BASELINE]` | `[PILOT_STATUS]`, `[GO_NOGO]: GO/NO` | E4 → `enterprise-measurement` | HOLD + 체크리스트 |
| `enterprise-measurement` | W0 베이스라인 요청, `[PILOT_STATUS]` (W4 완료) | `[KPI_BASELINE]` (W0), `[PILOT_VERDICT]`, `[ROI_ESTIMATE]` | Executive Report 생성 | ERROR + 베이스라인 확인 |

**Enterprise Track 실행 순서 계약:**
```
E1 @enterprise-readiness → [READINESS_SCORE]
E2 @enterprise-security-pack (병행) + @enterprise-measurement (W0 베이스라인)
E3 @enterprise-pilot-manager (W1~W4) → [PILOT_STATUS] × 4 + [GO_NOGO]
E4 @enterprise-measurement → [PILOT_VERDICT] + [ROI_ESTIMATE]
```

**E3 롤백 경로:**
- `[GO_NOGO]: NO` → `[PILOT_HOLD]` 출력 + 미충족 KPI 목록 → 사용자 재협의 후 W1 재시작

---

### Enterprise Track — Builder 모듈 (9개)

> SSOT: `enterprise/AGENTS.md` Builder Pipeline 섹션

| 에이전트 | Output Tags | 다음 단계 |
|---------|------------|---------|
| `enterprise-intake` | `[INTAKE_COMPLETE]` | `enterprise-goal-mapper` |
| `enterprise-goal-mapper` | `[GOAL_MAP_COMPLETE]` | 데이터 필요 → L3, 불필요 → L5 |
| `enterprise-data-request` | `[DATA_REQUEST_READY]` | `enterprise-analysis` |
| `enterprise-analysis` | `[ANALYSIS_COMPLETE]` | `enterprise-planning` |
| `enterprise-planning` | `[PLAN_READY]` | `enterprise-builder` |
| `enterprise-builder` | `[BUILD_COMPLETE]` | 납품 완료 |
| `enterprise-data-analyst` | `[DATA_ANALYSIS_DONE]` | 분기 합류 |
| `enterprise-operator` | `[OPERATION_COMPLETE]` | 외부 시스템 액션 |
| `enterprise-insight` | `[INSIGHT_READY]` | Executive 보고 |

---

## 미소비 태그 목록 (주의)

아래 태그는 생성되지만 현재 소비하는 에이전트/Hook이 없음. 사용자 직접 소비 또는 연동 추가 필요.

| 태그 | 생성 에이전트 | 상태 |
|------|-------------|------|
| `[CLUSTER_REPORT]` | @cohort-analyst | `[DEPRECATED_UNLINKED]` — 소비 에이전트 없음. 향후 @data-analyst 연동 시 활성화 예정 |
| `[PATTERN_ANALYSIS]` | @pattern-extractor | `[MANUAL_ONLY]` — 사용자 직접 소비. 자동화 불필요 (분석 결과 검토 필요) |
| `[GROWTH_PLAN]` | post-deploy (GROWTH_FLOW) | `[DEPRECATED_UNLINKED]` — 사용자 직접 소비. @gtm-strategist 연동 검토 중 |
| `[FEEDBACK_PRIORITIZED]` | post-deploy (FEEDBACK_FLOW) | `[NEEDS_CONSUMER]` — `/decision` 연동 목표. on-response.sh에 감지 로직 추가 필요 |

---

## 순환 위험 목록

| 순환 경로 | 위험도 | 가드 상태 |
|-----------|--------|---------|
| `@execution-review` → `[JUDGMENT]: 피벗` → `/decision` → Phase 6 → `@execution-review` | HIGH | ✅ pipeline-coordinator에 retry-tracker 통합 완료 (커밋 4eb35a2) |
| `@healer` → 수정 → `@testgen` → FAIL → `@healer` | MEDIUM | ✅ pipeline-coordinator에 3회 상한 카운터 통합 완료 (커밋 4eb35a2) |
| `cost-guard` → `pipeline-coordinator` → 다시 `cost-guard` | LOW | ✅ 단방향 흐름으로 순환 없음 |

---

## Tier 분류 (P3 라우터 노이즈 감소)

> 기준: CLAUDE.md 자동 라우팅(`→ @agent`) 존재 여부 + 실 사용 빈도

### Tier 1 — Core Auto-Routing (33개)
> CLAUDE.md에 명시적 `→ @agent` 라우팅 존재. 항상 활성.

`architecture`, `business-impact-prioritizer`, `cicd-designer`, `content-ads`, `content-blog`, `content-email`, `content-instagram`, `content-linkedin`, `content-twitter`, `cost-guard`, `data-analyst`, `data-pipeline-designer`, `deployment`, `dev-auditor`, `enterprise-measurement`, `enterprise-pilot-manager`, `enterprise-readiness`, `enterprise-security-pack`, `event-schema-designer`, `expert-planner`, `git-helper`, `gtm-strategist`, `healer`, `incident-responder`, `legacy-cleaner`, `marketing-content`, `pattern-extractor`, `product-diagnosis`, `project-router`, `proposal-orchestrator`, `channel-router`, `release-manager`, `stack-advisor`

### Tier 2 — Infrastructure / Skill-Chain (27개)
> 슬래시 커맨드, QA 체인, 시스템 오케스트레이션에 묵시적 사용.

`code-analyzer`, `code-quality`, `decision`, `execution-manager`, `execution-review`, `implementation`, `implementation-orchestrator`, `mvp-builder`, `pipeline-coordinator`, `pr-reviewer`, `researcher`, `screen-designer`, `secret-guard`, `security-tester`, `task-analysis-gate`, `task-breakdown`, `testgen`, `testops`, `ux-gate`, `writer`, `api-designer`, `db-designer`, `business-context-for-marketing`, `funnel-designer`, `marketing-strategy-builder`, `proposal-reviewer`, `verifiable-test-runner`

### Tier 3 — On-Demand / Rarely Used (44개)
> 명시적 라우팅 없음. 사용자 명시 호출 시만 활성. 라우터 우선순위 최하위.

`agent-evaluator`, `ops_lead`, `reviewer-counterparty`, `agent-log-auditor`, `architecture-drift-detector`, `asset-comparison-gate`, `bp-analyzer`, `business-visualization-architect`, `claude-code-integration`, `clear-safe`, `codebase-onboarding`, `cohort-analyst`, `content-brief`, `content-os-auditor`, `content-os-evolver`, `content-strategist`, `content-system-architect`, `cs-support-agent`, `deployment-secrets-auditor`, `devops-guard`, `fact-checker`, `feature-flag-manager`, `finops-advisor`, `growth-loop-designer`, `hypothesis-mapper`, `iac-designer`, `ide-router-verifier`, `integration-tester`, `legal-reviewer`, `memory-manager`, `okr-coach`, `ops-issue-triage`, `performance-auditor`, `pre-launch-final-auditor`, `qualitative-analyst`, `sales-ir-material-converter`, `seo-specialist`, `spec-implementation-verifier`, `target-value-uiux-auditor`, `tone-reviewer`, `reviewer-new-biz`, `reviewer-vc`, `reviewer-pmpo`, `reviewer-public`

> **라우터 적용 규칙:** 모호한 요청은 Tier 1 → Tier 2 순서로 먼저 매칭. Tier 3는 명시적 에이전트 이름 또는 고유 도메인 키워드가 있을 때만 활성화.

---

## 갱신 규칙

- 에이전트 신규 생성 시: 이 파일에 행 추가 필수
- 출력 태그 변경 시: Consumers 열 영향도 먼저 확인
- 미소비 태그 발생 시: 소비자 에이전트 연동 또는 `[DEPRECATED]` 표시
- Tier 분류 변경 시: 위 Tier 섹션 업데이트 필수


---

## 🆕 D-50 PROMOTION (2026-05-10) — engine → ai-system 12 자산 출시

### L3 — Context (마케팅 OS 추가)

| 에이전트 | Input Tags | Output Tags | Consumers | Failure |
|---------|-----------|-------------|-----------|---------|
| `business-context-for-marketing` | business_wiki/[프로젝트]/00_AI_ENTRY.md v1.x | `[MARKETING_CONTEXT]` | funnel-designer, marketing-strategy-builder | HOLD + 정본 박제 안내 |
| `funnel-designer` ⭐⭐ | `[MARKETING_CONTEXT]` | `[FUNNEL_DESIGN]` (AIDAR 5 단계) | marketing-strategy-builder, channel-router | 부분 산출 + 페르소나 안내 |
| `marketing-strategy-builder` | `[FUNNEL_DESIGN]` | `[MARKETING_STRATEGY]` | channel-router, content-strategist | 부분 산출 |

### L4 — Execution (Trust-Layer 추가)

| 에이전트 | Input Tags | Output Tags | Consumers | Failure |
|---------|-----------|-------------|-----------|---------|
| `verifiable-test-runner` | asset_id + asset_output | `[VERIFIABLE_RESULT]` | agent-evaluator, monthly-eval | BLOCKED < 80% |

### L5 — Skill (D-50 PROMOTION 6 skills)

```
- /global-channel-catalog        (마케팅 OS 4단계 보조 — 16+ 채널 메타데이터)
- /spot-checking                 (Hybrid Norm 5-10% 표본 / judge ≠ generator / 4 bias 대응)
- /constraint-checker ⭐         (Constraint 5룰 자동 검증 — 사용자 인사이트 #2)
- /dogfooding-validator ⭐       (PROMOTION 5 조건 자동 검증 — 사용자 인사이트 #3)
- /bootstrapping-korean-fonts   (한글 폰트 자동 설치 / 한국 특화)
- /bypassing-hangul-nfd          (macOS 한글 NFD 우회 / 한국 특화)
```

### PROMOTION 출처

> engine → product (D-50 / 2026-05-10)
> 출시 명세: `<internal-spec>`
> Constraint #2 정상 — Builder Track 고도화 (D-35 4 게이트 통과)
