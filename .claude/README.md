# Claude Code 설정

> Claude Code가 실제로 읽는 설정 디렉토리.

---

## 글로벌 vs 프로젝트 설정

Claude Code는 두 곳에서 설정을 읽습니다:

| 위치 | 범위 | 용도 |
|------|------|------|
| **`~/.claude/`** (글로벌) | 모든 프로젝트 | `/decision`, `@ux-gate` 등 어디서든 사용 |
| **`프로젝트/.claude/`** (로컬) | 해당 프로젝트만 | 프로젝트별 커스텀 설정 |

### 글로벌 설정 (권장, 한 번만)

```bash
# 모든 프로젝트에서 slash command, agent, skill 사용
$AI_SYSTEM/scripts/install-claude-code-global.sh
```

→ `~/.claude/commands/`, `~/.claude/agents/`, `~/.claude/skills/`에 설치됨.
→ 어떤 프로젝트에서든 `/decision`, `@ux-gate` 등 바로 사용 가능.

### 프로젝트별 설정 (선택)

```bash
cd /path/to/your/project

# .claude/ 복사
cp -r $AI_SYSTEM/.claude .claude

# CLAUDE.md 복사 후 프로젝트에 맞게 수정
cp $AI_SYSTEM/.claude/CLAUDE.md ./
```

→ 프로젝트별 `CLAUDE.md`에 기술 스택, 코딩 규칙 등 커스텀 가능.

---

## 디렉토리 구조

```
.claude/
├── agents/              # 서브에이전트 (@로 호출 — 정본 목록: AGENTS.md, 수 기준: docs/public/SKU_CATALOG_KO.md)
├── commands/            # 슬래시 명령어 (/로 호출)
├── prompts/             # 프롬프트 모음
├── *-automation/        # 자동화 스킬 (5개)
│   └── SKILL.md
├── CLAUDE.md            # 프로젝트 컨텍스트 템플릿
├── README.md            # 이 파일
└── settings.local.json  # 로컬 설정
```

---

## agents/ ↔ .claude/ 매핑 가이드

> **정본(Source of Truth):** `agents/` 디렉토리가 정본입니다.
> `.claude/agents/`는 Claude Code 전용 포맷으로 변환된 사본입니다.

### 역할 구분

| 유형 | 위치 | 용도 | 호출 방법 |
|------|------|------|-----------|
| **Agent 정의** | `agents/*.md` | 전체 규칙/역할 정의 (정본) | Cursor Sub-Agent |
| **Command** | `.claude/commands/*.md` | 빠른 실행 | `/명령어` |
| **Agent** | `.claude/agents/*.md` | 심층 분석 (대화형) | `@에이전트` |
| **Skill** | `.claude/*-automation/SKILL.md` | 자동 트리거 | 패턴 감지 |

### Command vs Agent vs Skill

| 상황 | 사용할 것 | 예시 |
|------|-----------|------|
| **빠른 실행** (한 번 호출) | Command (`/`) | `/decision`, `/debug` |
| **심층 분석** (대화형) | Agent (`@`) | `@ux-gate`, `@architecture` |
| **자동 트리거** (패턴 감지) | Skill | "구현 완료" → `testgen-automation` |

### 전체 매핑 테이블

| agents/ (정본) | Command | Agent | Skill |
|----------------|---------|-------|-------|
| `01_agent_decision.md` | `/decision` | — | — |
| `02_agent_mvp_builder.md` | `/docs-mvp` | `@mvp-builder` | — |
| `03_agent_architecture.md` | — | `@architecture` | — |
| `04_agent_execution_manager.md` | `/execution` | `@execution-manager` | — |
| `04_5_agent_implementation_orchestrator.md` | — | `@implementation-orchestrator` | — |
| `05_agent_task_breakdown.md` | `/task-breakdown` | `@task-breakdown` | — |
| `06_agent_implementation.md` | `/implement` | `@implementation` | — |
| `07_agent_execution_review.md` | — | `@execution-review` | — |
| `08_agent_devops_guard.md` | `/devops-check` | `@devops-guard` | — |
| `09_agent_researcher.md` | — | `@researcher` | — |
| `10_agent_writer.md` | — | `@writer` | — |
| `11_agent_deployment.md` | — | `@deployment` | — |
| `12_agent_code_quality.md` | `/review` | `@code-quality` | `code-review-automation` |
| `13_agent_security_tester.md` | — | `@security-tester` | — |
| `14_agent_testgen.md` | — | `@testgen` | `testgen-automation` |
| `15_agent_healer.md` | — | `@healer` | `healer-automation` |
| `16_agent_testops.md` | — | `@testops` | `testops-automation` |
| `18_agent_code_analyzer.md` | — | `@code-analyzer` | — |
| `19_agent_git_helper.md` | — | `@git-helper` | — |
| `20_agent_ux_gate.md` | `/ux-gate` | `@ux-gate` | `ux-gate-automation` |
| `01_agent_decision.md` | `/decision` | `@decision` | — |
| `17_agent_claude_code_integration.md` | — | `@claude-code-integration` | — |
| `21_agent_secret_guard.md` | `/security-gate` | `@secret-guard` | — |
| `22_agent_deployment_secrets_auditor.md` | `/secrets-audit` | `@deployment-secrets-auditor` | — |
| `23_agent_codebase_onboarding.md` | — | `@codebase-onboarding` | — |
| `24_agent_integration_tester.md` | — | `@integration-tester` | — |
| `25_agent_performance_auditor.md` | — | `@performance-auditor` | — |

### 동기화 규칙

1. **규칙 변경 시:** `agents/` 파일 먼저 수정 → `.claude/` 반영
2. **새 Agent 추가 시:** `agents/` 정의 작성 → 필요하면 `.claude/` 에 command/agent/skill 생성
3. **충돌 발생 시:** `agents/` 내용이 우선

---

## Commands (15개)

| 명령어 | 용도 |
|--------|------|
| `/decision` | Decision 판단 |
| `/execution` | Execution 단계 시작 |
| `/task-breakdown` | Task 분해 |
| `/implement` | 코드 구현 |
| `/debug` | 디버깅 |
| `/ux-gate` | UX 검증 |
| `/docs-mvp` | MVP 문서 생성 |
| `/validation` | 가설 검증 |
| `/devops-check` | DevOps 점검 |
| `/review` | 코드 리뷰 |
| `/pr-review` | PR 리뷰 |
| `/brainstorm` | 구조화된 브레인스토밍 세션 |
| `/standards-check` | 프로젝트 표준 검증 |
| `/security-gate` | 시크릿/보안 사전 점검 |
| `/secrets-audit` | 배포 시크릿 감사 |

## Agents (주요 예시 — 전체 목록은 `AGENTS.md`)

| 에이전트 | 용도 |
|----------|------|
| `@architecture` | 아키텍처 설계 |
| `@code-analyzer` | 코드베이스 분석 |
| `@code-quality` | 코드 품질 검증 |
| `@deployment` | 배포 안내 |
| `@devops-guard` | DevOps 감시 |
| `@execution-manager` | Execution Gate |
| `@execution-review` | 중간 점검/종료 판단 |
| `@git-helper` | Git 작업 |
| `@healer` | 테스트 실패 분석 |
| `@implementation` | 코드 작성 |
| `@implementation-orchestrator` | 구현 시작 안내 |
| `@mvp-builder` | MVP 문서 생성 |
| `@researcher` | 시장/경쟁 조사 |
| `@security-tester` | 보안 검증 |
| `@task-breakdown` | Task 분해 |
| `@testgen` | 테스트 자동 생성 |
| `@testops` | 테스트 결과 분석 |
| `@ux-gate` | UX 검증 |
| `@writer` | 문서 재작성 |
| `@decision` | Decision 판단 |
| `@claude-code-integration` | Claude/Cursor 통합 점검 |
| `@secret-guard` | 시크릿 유출 방지 게이트 |
| `@deployment-secrets-auditor` | 배포 시크릿 감사 |
| `@codebase-onboarding` | 기존 프로젝트 온보딩/현황 분석 |
| `@integration-tester` | API 계약/연동 통합 검증 |
| `@performance-auditor` | 배포 전 성능 점검 |

## Skills (5개)

| 스킬 | 트리거 |
|------|--------|
| `testgen-automation` | "구현 완료", "IMPLEMENTATION COMPLETE" |
| `healer-automation` | "테스트 실패", "TEST EXECUTION FAILED" |
| `testops-automation` | "테스트 완료", "TEST EXECUTION COMPLETE" |
| `ux-gate-automation` | UX 검증 필요 시 |
| `code-review-automation` | "코드 리뷰", "코드 품질 확인" |

---

---

## 새로 추가된 기능 (2026-02-12)

### Commands 추가
- `/brainstorm` - 구조화된 브레인스토밍 세션 (Vibe Code Kit에서 영감)
- `/standards-check` - 프로젝트 표준 검증 (ESLint, Prettier, TypeScript 등)

### Blueprints & Skillsets (완료 ✅)
- **Blueprints**: `templates/blueprints/ai-system-qa-pipeline.yaml`
- **Skillsets**: `templates/skillsets/ai-system-qa-pipeline.yaml`
- **설치 스크립트**: `scripts/install-blueprint.sh`, `scripts/install-skillset.sh`
- **가이드**: `playbook/09-routines-guides/blueprints-skillsets-guide.md`

### Hub 마켓플레이스 (완료 ✅)
- **인덱스 생성**: `scripts/generate-hub-index.sh`
- **인덱스 파일**: `hub/index.json` (Skills, Commands, Blueprints 자동 스캔)
- **가이드**: `hub/README.md`

### AI Rules 모듈화 (완료 ✅)
- **규칙 로더**: `scripts/load-rules.sh` (컨텍스트 인식 동적 로딩)
- **규칙 파일**: `.claude/rules/` (core, tech-stack, workflow, domain)
- **가이드**: `playbook/09-routines-guides/ai-rules-modularization.md`

### 코드 품질 검증 강화 (완료 ✅)
- `@code-quality` Agent에 Standards Compliance 검증 항목 추가
- Vibe Code Kit의 standards-checker 개념 통합

---

**마지막 업데이트:** 2026-02-20
**구현 상태:** 모든 신규 기능 완료 ✅
