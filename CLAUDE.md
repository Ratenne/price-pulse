# 프로젝트 컨텍스트

> Claude Code와 호환 AI 도구가 PricePulse 프로젝트를 이해하기 위한 컨텍스트 파일

**프로젝트명:** PricePulse
**작성일:** 2026-08-01

---

## 프로젝트 개요

### 목적
GPU·CPU·노트북의 6개월 가격 흐름을 비교하고, 현재 가격 위치와 적정 거래 범위를 구매자와 판매자 관점으로 설명하는 PC 가격 판단 데모 서비스입니다.

### 기술 스택
- Frontend: React 19, TypeScript, Vite 7, Tailwind CSS 4
- UI: Radix UI, Lucide React, Recharts, Framer Motion
- Routing: Wouter
- Backend/Serving: Express 4, Node.js
- Data: 로컬 TypeScript mock 데이터와 도메인 계산 로직
- Package Manager: pnpm
- Quality: TypeScript strict mode, Prettier
- Deployment Build: Vite 정적 번들 + esbuild Express 서버 번들

### 현재 구현 범위
- 홈 대시보드와 인트로 영상
- GPU·CPU·노트북 카테고리 탐색
- 가격 변동폭·현재가·최저가 근접 기준 전체 순위
- 상품별 6개월 가격 흐름과 적정 거래 범위
- 구매자·판매자 관점의 가격 판단 메시지
- 다크/라이트 테마, 반응형 UI, 404 처리
- 28개 시연용 상품 데이터

### 데이터 및 운영 경계
- 현재 가격 데이터는 시연용 로컬 mock 데이터입니다.
- 외부 가격 수집 API, 사용자 계정, 결제, 실거래 기능은 구현되어 있지 않습니다.
- 시크릿과 환경변수 원문은 문서나 Task에 기록하지 않습니다.

### AI-SYSTEM 참조
- 설치본 위치: `/Users/sulimlee/ai-kit-workspace/ai-system`
- 운영 계약: `/Users/sulimlee/ai-kit-workspace/ai-system/AGENTS.md`
- 전체 워크플로우: `/Users/sulimlee/ai-kit-workspace/ai-system/OPERATION.md`
- Phase 흐름: `/Users/sulimlee/ai-kit-workspace/ai-system/AGENT_FLOW.md`
- 상세 가이드: `/Users/sulimlee/ai-kit-workspace/ai-system/playbook/`

---

## 주요 디렉토리 구조

```
price-pulse-demo/
├── client/
│   ├── public/          # 카테고리 이미지와 인트로 영상
│   └── src/
│       ├── components/  # 화면 및 UI 컴포넌트
│       ├── contexts/    # 앱/테마 전역 상태
│       ├── data/        # 시연용 상품 데이터
│       ├── domain/      # 상품·카테고리 타입
│       ├── lib/         # 가격 표현·페이지네이션·캔버스 로직
│       ├── pages/       # 홈·순위·카테고리·상세·안심거래
│       └── services/    # 상품 조회·정렬·요약 로직
├── server/              # 프로덕션 정적 파일 제공 서버
├── shared/              # 공용 상수
├── tasks/               # 완료 및 후속 Task 목록
├── .claude/             # AI-SYSTEM Claude Code 설정
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## AI-SYSTEM 통합

### Decision 단계
- Command: `/decision`
- 파일: `docs/00_context.md` ~ `docs/04_solution.md` 참조
- 출력: `decisions/[project-name].md`

### Execution 단계
- Command: `/execution`
- 필수 파일: `decision-lock.md`
- Agent: `execution-manager` Subagent

### Task Breakdown
- Command: `/task-breakdown`
- Agent: `@task-breakdown`
- 입력: `docs/07_architecture.md`
- 출력: `tasks/task-list.md`

### 진행중인 프로젝트 TASK 정리
- **완료된 Task 정리:** 현재 코드베이스 분석하여 구현된 기능을 Task 형식으로 정리
- **남은 Task 생성:** `/task-breakdown` 사용하여 남은 작업을 Task로 분해
- **참고 문서:** `playbook/01-project-lifecycle/task-documentation-guide.md`
- **프롬프트:** `.claude/prompts/ongoing-project-setup-prompts.md` 참조

### 기능 추가
- **Architecture 업데이트 (필요 시):** `@architecture` Agent 사용
- **Task Breakdown:** `/task-breakdown` Command 사용하여 새 Task 추가
- **참고 문서:** `playbook/01-project-lifecycle/feature-addition-guide.md`

### Implementation
- Cursor: 코드 구현 (Implementation Agent)
- Claude Code: 코드 리뷰, 문서화

### 구현 완료 태그 계약 (on-response.sh 감지 대상)

구현이 완료되면 반드시 아래 태그를 응답에 포함한다:

```
[IMPLEMENTATION_COMPLETE]: TASK-XX
```

- **감지 주체:** `on-response.sh` Stop Hook (섹션 12 — 스냅샷 자동 갱신 트리거)
- **다음 액션:** `logs/hooks/pending-actions.md`에 testgen 체인 힌트 기록 → 사용자가 `testgen-automation` Skill 수동 실행
- **SSOT:** `.claude/agents/CONTRACT_REGISTRY.md` L4 — implementation 행
- **주의:** 이 태그가 없으면 QA 자동 체인이 시작되지 않음

### QA 단계
- **Skills:** `testgen-automation`, `healer-automation`, `testops-automation`, `ux-gate-automation`, `code-review-automation`
- **Commands:** `/ux-gate` - UX 검증, `/review` - 코드 리뷰, `/pr-review` - PR 리뷰, `/brainstorm` - 브레인스토밍, `/standards-check` - 표준 검증, `/planner-review` - 기획 종합 리뷰
- **Agents:** `@ux-gate` - UI/UX 종합 검증, `@testgen` - 테스트 생성, `@healer` - 테스트 실패 분석, `@security-tester` - 보안 검증, `@code-quality` - 코드 품질 검증
- **프롬프트:** `.claude/prompts/qa-frontend-debug-prompts.md` 참조
- **Blueprints & Skillsets:** `templates/blueprints/`, `templates/skillsets/` 참조

### QA 요청 (전체 파이프라인)
- **자동 실행:** "구현 완료! QA 검증해줘." → 전체 QA 파이프라인 자동 실행
- **참고 문서:** `playbook/02-qa-testing/integrated-qa-scenarios.md`

### 프론트/백/DB 연결 검증
- **프롬프트:** `[FRONTEND VERIFICATION]` 사용
- **검증 항목:** API 레이어, 상태 관리, 비즈니스 로직, UI 레이어
- **참고 문서:** `playbook/07-frontend/frontend-verification-routine.md`
- **프롬프트:** `.claude/prompts/qa-frontend-debug-prompts.md` 참조

### 기능 오류 해결 (디버깅)
- **Agent:** `@healer` - 테스트 실패 분석
- **Skill:** `healer-automation` - 자동 실행 (테스트 실패 시)
- **Command:** `/debug` - 디버깅
- **참고 문서:** `playbook/02-qa-testing/healer-automation-guide.md`

---

## 코딩 규칙

### 필수 규칙
- 신규 구현 전: 선행 Gate/문서 상태를 먼저 점검한다.
- 사용자 요청 범위를 벗어나는 확장은 금지한다.
- 결과는 재현 가능한 검증 근거(명령/파일/태그)와 함께 기록한다.

### 스타일 가이드
- [스타일 가이드 1]
- [스타일 가이드 2]

---

## 🔒 보안 가드 규칙 (SSOT 참조)

보안 상세 규칙의 단일 기준 문서는 아래 파일이다.
- SSOT: `.claude/rules/core/security.md`

여기서는 운영용 핵심 원칙만 유지한다.
- 시스템 영역/루트 권한/키체인 조작 금지
- 민감정보(API Key/Token/Secret/.env) 출력·커밋 금지
- 위험 명령 실행 전 사용자 승인 필수
- 위반 시 `[SECURITY_VIOLATION]` 포맷으로 즉시 보고

정책 변경은 반드시 SSOT 파일 먼저 수정하고, 본 문서는 링크와 요약만 유지한다.

---

## Skills

### AI-SYSTEM Skills (필수)

- `testgen-automation` - 구현 완료 시 테스트 자동 생성
- `healer-automation` - 테스트 실패 시 자동 분석 및 수정 제안
- `testops-automation` - 테스트 완료 시 자동 결과 분석
- `ux-gate-automation` - 구현 완료 시 UI/UX 자동 검증
- `code-review-automation` - 코드 변경 시 자동 코드 리뷰
- `review-chain-automation` - 구현 완료 시 4단계 순차 리뷰 (planning→technical→qa→marketing)
- `spec-to-test` - 화면/API 설계 완료 후 테스트 시나리오 자동 생성
- `changelog-generator` - git log → CHANGELOG.md 자동 생성
- `weekly-review-automation` - 주간 자동 리뷰 체인 (코드품질/레거시/보안/성능/트래킹/설계정합)
- `idea-to-deploy` - 아이디어 한 줄 → Phase 0~8 전체 파이프라인 단일 진입점
- `post-deploy` - 배포 후 운영 자동화 (장애/피드백/성장 3가지 흐름 자동 분기)
- `pm-sync` - Linear/Notion/Jira와 task-list.md 동기화
- `cost-guard-automation` - S/A 등급 에이전트 호출 또는 다중 체인 시작 시 자동 비용 추정 + 예산 초과 차단

### 외부 Skills (권장)

**참고:** `playbook/03-dev-environment/claude-code-external-skills-guide.md` 참조

**필수 (모든 프로젝트):**
- `vercel-labs/skills` - Skills 검색 및 관리 도구
- `daleseo/korean-skills/humanizer` - 한국어 문서 AI 냄새 제거

**선택적 (프로젝트별):**
- `obra/superpowers` - 상세 설계 문서 자동 생성 (복잡한 프로젝트 권장)
- `nextlevelbuilder/ui-ux-pro-max-skill` - UI/UX 디자인 시스템 및 안티패턴 검출 (프론트엔드 프로젝트 권장)

**설치 방법:**
```bash
# 필수 Skills 설치
npx skills add vercel-labs/skills
npx skills add daleseo/korean-skills/humanizer

# 선택적 Skills 설치
npx skills add obra/superpowers
npx skills add nextlevelbuilder/ui-ux-pro-max-skill
```

**사용 시점:**
- **Humanizer:** 문서 작성 후 (`docs/00~08.md`, `tasks/task-list.md` 등)
- **Superpowers:** Architecture 단계 이후 상세 설계 문서 생성 시
- **UI/UX Pro Max:** UX Gate 단계에서 디자인 시스템 및 안티패턴 검출 시

---

## 워크플로우

### 사업 기획 (Pre-Phase 0)
1. `@expert-planner` Agent로 서비스 분석 및 사업 문서 생성
2. `docs/business/00~05.md` 자동 생성
3. 사업 설계 vs 개발본 비교 분석

### 프로젝트 시작
1. `docs/00~04.md` 작성 (인간 또는 `@expert-planner` 참조)
2. `/decision` Command 실행
3. GO 판정 시 `/execution` Command 실행
4. (선택) Superpowers로 상세 설계 문서 생성

### 구현 중
1. Cursor에서 코드 구현
2. 구현 완료 → QA 순차 체인 실행 (TestGen → UX Gate → Code Review)
3. 테스트 실패 → Healer 자동 실행
4. UX 검증 → `/ux-gate` Command 또는 `@ux-gate` Agent 사용
5. 코드 품질 검증 → `/review` 또는 `/standards-check` Command 사용
6. (선택) UI/UX Pro Max로 안티패턴 검출

### 개발 감사
1. `@dev-auditor` Agent로 코드베이스 종합 감사
2. 설계 대비 구현 일치도, 기술 부채, 배포 파이프라인 분석

### 문서 작성 후
1. Humanizer로 AI 냄새 제거 (`docs/`, `tasks/` 등)

---

**참고:** AI-SYSTEM의 `OPERATION.md`와 `AGENT_FLOW.md`를 참고하세요.

---

## 지침 참조 규칙 (자동 라우팅)

**사용자가 다음 표현을 사용하면:**
- "지침에 따라서"
- "규칙에 따라서"
- "AI-SYSTEM 규칙에 따라서"
- "CLAUDE.md에 따라서"
- ".claude/rules/에 따라서"

**→ 이 파일과 `.claude/rules/` 디렉토리의 모든 규칙을 명시적으로 참조하고 적용해야 함**

---

## 🚦 AI-SYSTEM v3 Router Contract (Claude Code에서 "알아서" 동작시키기)

사용자가 짧게 말해도(예: "진행해", "확인해봐") **반드시 Phase로 라우팅**하고, 아래 **완성형 태그 블록**을 먼저 출력한다.
공통 진입 문구는 반드시 다음 표현을 포함해 인식한다: **"지침에 따라서 진행해."**

트리거(라우터 강제):
- "지침에 따라서", "가이드대로", "정본대로"
- "진행해", "계속해", "가능해?"
- "확인해봐", "다 된거야?", "끝났어?", "끝이야?"
- "문서화", "정리해", "업데이트 했어?"
- "고도화", "스프린트", "iteration", "다음 버전"
- "너가 해", "해결해", "커밋하고 배포해"
- "장문 프롬프트", "프롬프트 날린 것", "채팅 기반 스킬화"

공통 규칙(강제):
1. 응답 첫 줄에 반드시 `[ROUTER]`를 출력한다.
2. 그 다음 줄에 반드시 아래 중 하나의 **완성형 블록**을 출력한다:
   - Gate 요청이면 `[GATE]` 블록
   - Review 요청이면 `[JUDGMENT]` 블록
   - 스프린트 스코프 요청이면 `[ITERATION_SCOPE]` 블록
3. 정보가 부족하면 실행하지 말고 `HOLD/보류/NEED_INPUT`으로 멈춘 뒤, 질문은 **1개만** 한다.
4. 설명/미화 금지. 태그 블록과 다음 질문(1개)이 전부다.

완성형 블록(절대 생략 금지):

Gate (Phase 4):
```
[GATE]: OPEN / HOLD
[VALUE]: PASS / HOLD
[RESOURCE]: PASS / HOLD
[HUMAN_OVERRIDE]: ACCEPTED / ACCEPTED_MANUAL / REJECTED / N/A
[REASON]:
```

Review (Phase 7):
```
[JUDGMENT]: 계속 / 종료 / 보류 / 피벗 / 중단
[HUMAN_OVERRIDE]: ACCEPTED / ACCEPTED_MANUAL / REJECTED / N/A
[REASON]:
```

Iteration (Phase 2):
```
[ITERATION_SCOPE]: DRAFT / NEED_INPUT
[REASON]:
```

참조 프롬프트(SSOT):
- `prompts/00_router_v3.md` (ai-system 레포)

---

## AI-First 거버넌스 (v3)

### 의사결정 주권 원칙
- 기본 판단 주체: AI
- 인간 개입: 예외 승인만 허용
- 직관: 결정 근거가 아니라 재검증 트리거
- 근거 없는 반려/보류: 무효

### Human Exception 포맷 (강제)
AI 판단을 인간이 반려/변경할 때 반드시 아래 형식 제출:

```
[HUMAN_OBJECTION]
- 근거: [사실/데이터]
- 데이터 반례: [AI 판단과 충돌하는 측정값]
- 리스크: [현 판단 유지 시 위험]
- 대안: [대체 판단/실험]
```

### 금지 규칙 (반직관 통제)
- 느낌 기반 HOLD 금지
- 권위 기반 반려 금지
- 경험 기반 무효화 금지
- 감정 기반 우선순위 변경 금지

**→ 컨텍스트에 따라 적절한 Command/Agent/Skill을 자동으로 선택하고 실행해야 함:**

**트리거 충돌 시 우선순위 (3단계):**
1. 파일 상태 (git diff / decision-lock.md / task-list.md 존재 여부)
2. 한정 키워드 (입력에 추가된 명사·동사 단서)
3. 직전 출력 태그 (이전 응답에 있던 [TAG] 기준)
→ 충돌 해소 상세 규칙: `prompts/00_router_v3.md` 트리거 충돌 해소 매트릭스

**코워크/장문 프롬프트 자동 스킬 위임:**
- "장문 프롬프트", "프롬프트 날린 것", "긴 프롬프트", "채팅 기반 스킬화", "내 프롬프트 스킬로" → `long-prompt-to-skill-extractor` Skill
- 안전 규칙: `install.sh`/`uninstall.sh`는 명시적 실행 요청 전까지 읽기/검증만 한다.

**컨텍스트 기반 자동 라우팅:**

0. **사업 기획 필요** ("사업 분석", "사업 기획", "Target 분석", "Value 분석", "사업계획서", "수익 모델" 언급)
   - → `@expert-planner` Agent 호출
   - → `docs/business/` 디렉토리에 사업 문서 생성

1. **프로젝트 시작 전** (`docs/00~04.md` 존재, `decision-lock.md` 없음)
   - → `/decision` Command 실행

2. **Decision Lock 후** (`decision-lock.md` 존재, `docs/07_architecture.md` 없음)
   - → `/execution` Command 실행
   - → `@architecture` Agent 호출

3. **Architecture 완료 후** (`docs/07_architecture.md` 존재, `tasks/task-list.md` 없음)
   - → `/task-breakdown` Command 실행

4. **구현 완료 후** ("구현 완료" 언급)
   - → `testgen-automation` Skill 실행
   - → `ux-gate-automation` Skill 실행
   - → `code-review-automation` Skill 실행
   - 주의: "동시 실행"이 아니라 순차 실행을 기본으로 한다.

5. **테스트 실패** ("테스트 실패" 언급)
   - → `healer-automation` Skill 자동 실행

6. **코드 리뷰 필요** ("코드 리뷰", "코드 품질 확인" 언급)
   - → `code-review-automation` Skill 자동 실행
   - → `/review` Command 또는 `@code-quality` Agent 호출

7. **UX 검증 필요** ("UX 검증", "문구 확인" 언급)
   - → `ux-gate-automation` Skill 자동 실행
   - → `/ux-gate` Command 또는 `@ux-gate` Agent 호출

8. **표준 검증 필요** ("표준 검증", "standards check" 언급)
   - → `/standards-check` Command 실행

9. **브레인스토밍 필요** ("브레인스토밍", "아이디어 정리" 언급)
   - → `/brainstorm` Command 실행

10. **기획 종합 리뷰 필요** ("기획 리뷰", "제품 분석", "서비스 기획", "기능 구상", "불필요 기능", "planner review", "남은 작업 정리", "현황 정리해줘", "우리 서비스 분석" 언급)
   - → `/planner-review` Command 실행
   - → `docs/planner/` 기획 문서 업데이트

11. **개발 감사 필요** ("개발 분석", "코드 감사", "기술 부채", "개발본 분석", "배포 이슈 분석" 언급)
   - → `@dev-auditor` Agent 호출
   - → 코드베이스 종합 건강도 판정
   - ⚠️ **충돌 해소**: "분석해봐" 단독 입력 시 → `prompts/00_router_v3.md` 충돌 매트릭스 참조
     - 최근 git 변경 있음 + "코드" 언급 → @dev-auditor (Rule #11)
     - "우리 제품/서비스 전체" 또는 단서 없음 → @product-diagnosis (Rule #30)
     - "채널/패턴/자동화" 언급 → @pattern-extractor (Rule #27)

13. **커밋 요청** ("커밋해", "저장해", "git 커밋" 언급)
   - → `.claude/rules/workflow/commit-policy.md` 참조 (COMMIT GATE 4항목 체크)
   - → `@git-helper` Agent 호출

14. **릴리즈/배포 조합 요청** ("커밋하고 배포해", "푸시도 했어?", "배포하자" 언급)
   - → `release-ops-bridge` Skill 실행

15. **신규 에이전트/스킬/프롬프트 필요** ("에이전트 만들어", "스킬 추가", "프롬프트 설계", 해당 에이전트 없음 감지)
   - → `.claude/rules/workflow/agent-skill-design.md` 참조
   - → 존재 여부 먼저 확인 (AGENTS.md + .claude/agents/)
   - → 설계 명세 먼저 출력 후 사용자 확인 → 파일 생성

16. **인간 예외 승인 요청** ("내가 이 판단 반려", "AI 판단 무시", "직관적으로 보류" 언급)
   - → `[HUMAN_OBJECTION]` 포맷 제출 요구
   - → 4항목 충족 시 재검증 Task 생성 후 Decision/Review 재판정
   - → 4항목 미충족 + 인간 명시 요청 시 `ACCEPTED_MANUAL` 허용
   - → `ACCEPTED_MANUAL` 시 `[MANUAL_OVERRIDE_LOG]` 기록 요구

17. **레거시 정리 필요** ("레거시 정리", "기술 부채 정리", "deprecated 코드", "사용 안 하는 코드", "코드 정리" 언급)
   - → `@legacy-cleaner` Agent 호출
   - → 제거 로드맵 + Task 초안 생성

18. **릴리즈 버전 관리** ("버전 올려", "릴리즈 준비", "changelog", "릴리즈 노트", "semantic versioning" 언급)
   - → `@release-manager` Agent 호출
   - → `changelog-generator` Skill 연동 → CHANGELOG.md 자동 업데이트

19. **데이터 파이프라인 설계** ("데이터 파이프라인", "데이터 수집", "ETL", "데이터 웨어하우스", "로그 수집", "이벤트 파이프라인" 언급)
   - → `@data-pipeline-designer` Agent 호출
   - → docs/data/ 디렉토리에 파이프라인 설계 문서 생성

20. **주기적 리뷰** ("주간 리뷰", "정기 리뷰", "이번 주 점검", "weekly review", "코드베이스 건강도" 언급)
   - → `weekly-review-automation` Skill 실행
   - → docs/weekly-reports/ 에 리포트 저장

21. **배포 후 운영 중** ("운영 중", "사용자 반응", "KPI 확인", "다음 버전", "유저 피드백", "배포 후", "오류 났어", "사용자 불만", "다음 스프린트" 언급)
   - → `post-deploy` Skill 실행 (3가지 흐름 자동 감지 후 분기)
   - → 장애 신호: @incident-responder → @healer → @deployment
   - → 피드백 신호: `python3 scripts/routines/feedback-routine.py` → @data-analyst → @business-impact-prioritizer → /decision
   - → 성장 신호: @event-schema-designer

23. **기술 스택 추천** ("기술 스택 추천", "프레임워크 선택", "어떤 기술 써야 해", "스택 결정", "백엔드 뭐 써", "Next.js vs" 언급)
   - → `@stack-advisor` Agent 호출
   - → 비개발자 기준 추천 우선, 보일러플레이트 디렉토리 구조 + 설정 파일 초안 생성

24. **비용/예산 확인** ("비용 확인", "토큰 사용량", "예산 초과", "API 비용", "에이전트 체인 비용" 언급)
   - → `@cost-guard` Agent 호출
   - → 실행 예정 에이전트 목록 기준 예상 비용 추정 → 예산 초과 시 `[GATE]: HOLD`

25. **프로덕션 장애 대응** ("배포 후 오류", "프로덕션 에러", "장애 대응", "핫픽스", "서비스 다운" 언급)
   - → `@incident-responder` Agent 호출
   - → P0~P3 등급 분류 → 즉시 조치 체크리스트 → 핫픽스 수정 포인트 제시

0. **새 프로젝트 시작 / 아이디어 입력** ("~만들고 싶어", "아이디어가 있어", "처음부터 시작해줘", "새 프로젝트" 언급)
   - → `idea-to-deploy` Skill 실행
   - → 현재 상태 자동 감지 (신규 or Fast-Track) → 해당 Phase 에이전트 연결

26. **CI/CD 파이프라인 설계** ("CI/CD 설계", "GitHub Actions", "배포 자동화", "파이프라인 설계", "배포 워크플로우" 언급)
   - → `@cicd-designer` Agent 호출
   - → 아키텍처 기반 워크플로우 생성 → .github/workflows/ 파일 초안 생성

27. **채널 반복 패턴 분석** ("반복 패턴 분석", "자동화 후보", "스킬로 만들 수 있는 것", "채널 패턴 정리", "어떤 게 에이전트화 가능해" 언급)
   - → `@pattern-extractor` Agent 호출
   - → `python3 scripts/analyze-automation-candidates.py` 실행
   - → [PATTERN_ANALYSIS] → [AGENT/SKILL DESIGN] 초안 도출

28. **세션 재개 / 컨텍스트 복구** ("이어서", "어디까지 했지", "현재 상태", "세션 복구", "재개해", "마지막에 뭐 했지" 언급)
   - → `project-reentry` Skill 실행
   - → docs/state/execution-context.md + tasks/task-list.md + evidence-registry.md 자동 로드
   - → [REENTRY_REPORT] 출력 + 다음 액션 1개 제시

29. **구현 시작 / Task 게이트** ("구현 시작", "구현해도 돼?", "TASK-XX 구현", "분석 완료?" 언급)
   - → `task-analysis-gate` Skill 또는 `@task-analysis-gate` 에이전트 실행
   - → Task 존재 + 분석 완료 + 이전 테스트 미실패 3-check → [GATE]: OPEN/BLOCKED

30. **제품 종합 진단** ("우리 제품 어때", "제품 진단", "종합 진단", "전방위 분석", "서비스 현황 분석", "제품 건강도", "단계별로 분석해줘" 언급)
   - → `@product-diagnosis` Agent 호출
   - → Phase 0(사업) → Phase 3(설계) → Phase 6(개발) → Phase 7(UX/보안) → Phase 8(GTM) 순서로 진단
   - → [PRODUCT_DIAGNOSIS] 출력 + [OVERALL] 종합 판정 + 즉시 조치 TOP 3
   - ⚠️ **충돌 해소**: "분석해봐" 단독 입력 → Rule #11/#27/#30 동시 매칭 가능
     - 기본값(단서 없음): Rule #30 (`@product-diagnosis`) 우선
     - 상세 매트릭스: `prompts/00_router_v3.md` → "트리거 충돌 해소 매트릭스" 섹션

31. **산출물 등급 분류** ("public/internal 분리", "문서 등급", "배포용 분리", "산출물 등급", "분류 가드" 언급)
   - → `artifact-classification-guard` Skill 실행
   - → docs/analysis-results 신규 파일 생성 직후 자동 활성화
   - → public/internal/restricted 등급 판정 + 저장 경로 강제

32. **분석 산출물 민감정보 마스킹** ("sanitize", "마스킹", "민감정보 제거", "analysis-results 점검" 언급)
   - → `data-sanitizer` Skill 실행
   - → docs/analysis-results/*.csv|json 업데이트 직후 자동 활성화
   - → 민감 필드 마스킹 후 공개 가능 여부 판정

---

---

## Enterprise Track 라우팅 (기업 AI 도입)

> Builder Track(개인/스타트업)과 독립된 트랙. `enterprise/` 서브디렉토리 기반.

**트리거:** "파일럿 시작", "사내 AI 도입", "기업 AI 운영", "엔터프라이즈 셋업", "도입 준비도", "8축 스냅샷", "W1/W2/W3/W4", "보안팩", "PIA", "SIG CAIQ", "H1~H5", "Executive Report", "Phase1 Skills"

**E1. 도입 준비도** ("도입 준비도", "Day0 점수", "파일럿 시작 전" 언급)
   - → `@enterprise-readiness` → [READINESS_SCORE] → `enterprise/docs/[고객사명]/readiness-report.md`

**E2. 보안팩 + 베이스라인** (READINESS ≥ CONDITIONAL 이후)
   - → `@enterprise-security-pack` → [SECURITY_VERDICT] → `enterprise/docs/[고객사명]/security-pack-report.md`
   - → `@enterprise-measurement` (베이스라인 W0) → [KPI_BASELINE]

**E3. 파일럿 실행** (SECURITY_VERDICT: CLEARED + KPI_BASELINE 완료 이후)
   - → `@enterprise-pilot-manager` → [PILOT_STATUS] + [GO_NOGO] → `enterprise/docs/[고객사명]/pilot-status-W[N].md`

**E4. 최종 측정 및 보고** (W4 완료 이후)
   - → `@enterprise-measurement` → [PILOT_VERDICT] + [ROI_ESTIMATE] → `enterprise/docs/[고객사명]/executive-report-final.md`

**실행 순서:** E1 → E2(병행) → E3(W1→W4) → E4

---



## 🆕 D-50 PROMOTION 라우팅 룰 (2026-05-10) — engine → ai-system 12 자산

34. **마스터 진입 — 3 영역 자동 라우팅** ("지침에 따라 [프로젝트X] 진행해" / "[프로젝트X] 전체 분석" / "[프로젝트X] 통합 진행" 언급)
   - → `@project-router` Agent 호출
   - → 사업/개발/마케팅 3 영역 자동 분류 + 영역별 chain 자동 호출
   - → `[PROJECT_ROUTER]` 산출

40. **Verifiable test** ("verifiable test" / "정량 검증" / "verify")
   - → `@verifiable-test-runner` Agent 호출
   - → `[VERIFIABLE_RESULT]` (Hybrid Norm)

41. **Spot-check** ("spot check" / "표본 검증" / "calibration")
   - → `/spot-checking` SKILL 호출
   - → 5-10% 무작위 표본 / judge ≠ generator

42. **Constraint 5룰 자동 검증** ⭐ ("constraint check" / "제약 검증" / 모든 자산·결정 호출 시 자동)
   - → `/constraint-checker` SKILL 자동 트리거
   - → 5룰 (맞춤개발/엔진추가/Top12외/XR2건/이번만예외) 자동 검증

43. **도그푸드 PROMOTION 검증** ⭐ ("도그푸드 검증" / "PROMOTION 검증")
   - → `/dogfooding-validator` SKILL 호출
   - → PROMOTION 5 조건 자동 검증 (월말 cron)

44. **한글 폰트 자동** (한국어 docx/pdf/svg 빌드 시 자동)
   - → `/bootstrapping-korean-fonts` SKILL 자동 트리거
   - → NanumGothic 자동 설치

45. **한글 NFD 우회** (macOS 한글 폴더 작업 시 자동)
   - → `/bypassing-hangul-nfd` SKILL 자동 트리거
   - → Glob/raw bytes/unicodedata 자동 적용

---

**자동 라우팅 원칙:**
- 현재 프로젝트 상태(파일 존재 여부)를 먼저 확인
- 워크플로우 Phase에 맞는 Command/Agent/Skill 자동 선택
- 사용자가 명시적으로 Command/Agent/Skill을 지정하면 그것을 우선 사용
- "지침에 따라서" 표현은 규칙 참조 + 자동 라우팅 모두 수행
- `load-rules.sh`로 로딩된 규칙도 포함하여 적용
