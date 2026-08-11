# Workflow Rules: Agent / Skill / Prompt 설계 우선 원칙

## WHEN

다음 상황 중 하나라도 해당하면 이 규칙을 적용한다.

- 새로운 에이전트(`@xxx`) 생성이 필요한 경우
- 새로운 Skill(`templates/codex/skills/`)이 필요한 경우
- 기존 에이전트/스킬 고도화(기능 변경/확장) 요청이 온 경우
- 새로운 프롬프트(`prompts/`)를 작성해야 하는 경우
- `AGENTS.md`에 없는 에이전트를 호출하려는 경우

---

## DO

1. **존재 여부 먼저 확인한다.**
   - `AGENTS.md` 에이전트 목록 확인
   - `.claude/agents/` 파일 목록 확인
   - `templates/codex/skills/` 디렉토리 확인
   - 유사한 기능의 기존 에이전트/스킬이 있으면 **확장**을 먼저 시도한다.

2. **신규 생성 전 설계 문서를 먼저 작성한다.**

   최소 아래 항목을 명시:
   ```
   [AGENT/SKILL DESIGN]
   이름: @[agent-name] 또는 [skill-name]
   레이어: L1 Router / L2 Orchestrator / L3 Context / L4 Execution / L5 Skill
   트리거: [이 에이전트/스킬을 호출하는 표현]
   입력: [필요한 파일/컨텍스트]
   출력 태그: [OUTPUT_TAG]
   연동: [upstream 에이전트] → [this] → [downstream 에이전트]
   SSOT 참조: [기준 문서 경로]
   ```

3. **고도화 시에도 설계 변경 명세를 먼저 작성한다.**
   - 변경 전/후 출력 태그가 달라지면 → 연동 에이전트 영향도 먼저 확인
   - 트리거 추가/삭제 시 → AGENTS.md + 전체 IDE 파일 동기화 필요 여부 확인

4. **설계 승인(또는 사용자 확인) 후 파일을 생성한다.**

---

## DON'T

- ❌ 설계 없이 `.claude/agents/*.md` 파일을 바로 생성하지 않는다.
- ❌ 유사 에이전트 확인 없이 중복 에이전트를 만들지 않는다.
- ❌ `AGENTS.md` 미등재 상태로 에이전트 파일만 추가하지 않는다.
- ❌ IDE 동기화(AGENTS.md → cursorrules → windsurf.md → claude-router.md → copilot-instructions.md) 없이 완료 선언하지 않는다.
- ❌ 기존 에이전트 출력 태그를 변경할 때 연동 에이전트를 확인하지 않고 변경하지 않는다.

---

## CHECK (완료 기준)

신규 에이전트/스킬 생성 후 반드시 아래를 확인한다.

```
[ ] .claude/agents/[name].md 생성
[ ] AGENTS.md 에이전트 수 업데이트 + 항목 추가
[ ] .cursorrules 에이전트 수 + @섹션 추가
[ ] .windsurf/windsurf.md 에이전트 수 + 목록 추가
[ ] .vscode/claude-router.md 에이전트 수 + 목록 추가
[ ] .github/copilot-instructions.md 에이전트 수 + 목록 추가
[ ] .claude/CLAUDE.md 에이전트 수 업데이트
```

---

## 레이어 배치 기준

| 역할 | 레이어 | 예시 |
|------|--------|------|
| 지시어 분류 + Phase 라우팅 | L1 Router | ai-system-router |
| 실행 조율, Gate 판정 | L2 Orchestrator | execution-manager, pipeline-coordinator |
| 상태 파악, 읽기 전용 분석 | L3 Context | code-analyzer, data-analyst |
| 실제 파일 생성/수정 | L4 Execution | implementation, testgen, deployment |
| 자동 트리거 패턴 | L5 Skill | testgen-automation, release-ops-bridge |

---

## 참고

- SSOT: `AGENTS.md` (에이전트 수, 트리거, 출력 태그 기준)
- 에이전트 흐름: `AGENT_FLOW.md`
- 스킬 디렉토리: `templates/codex/skills/`
- 기존 에이전트 예시: `.claude/agents/` 참고
