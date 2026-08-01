#!/usr/bin/env bash
# .claude/hooks/on-response.sh
# Claude Code Stop Hook — 응답 태그를 파싱해 자동 액션 실행
#
# 트리거:  Claude가 응답을 완료할 때마다 실행 (Stop hook)
# 입력:    stdin으로 JSON { "session_id": "...", "transcript_path": "..." }
# 동작:    마지막 어시스턴트 메시지에서 액션 태그를 감지해 실행

set -eo pipefail

# ── 프로젝트 루트 ─────────────────────────────────────────────
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HOOK_DIR/../.." && pwd)"
LOG_FILE="$ROOT/logs/hooks/response-actions.log"
mkdir -p "$(dirname "$LOG_FILE")"

# hook_failed 신호(privacy-safe 기본 ON, opt-out 가능) — set -e로 훅이 예기치 못하게 중단되면 익명 emit. 내용 X, 훅 흐름 방해 없음.
_on_err() {
  local code=$?
  [ -x "$ROOT/.claude/hooks/usage-emit.sh" ] && bash "$ROOT/.claude/hooks/usage-emit.sh" hook_failed "" runtime=claude_code result=fail error_code="exit_${code}" tool_family=claude_code error_stage=hook 2>/dev/null || true
}
trap '_on_err' ERR

# ── stdin 파싱 ───────────────────────────────────────────────
INPUT="$(cat)"
TRANSCRIPT_PATH="$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('transcript_path',''))" 2>/dev/null || echo "")"

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# ── 마지막 어시스턴트 메시지 추출 ────────────────────────────
LAST_MSG="$(python3 - "$TRANSCRIPT_PATH" <<'PY'
import sys, json

transcript_path = sys.argv[1]
last_text = ""

with open(transcript_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            role = obj.get("role", "")
            # Claude Code transcript format: role=assistant, content=str or list
            if role == "assistant":
                content = obj.get("content", "")
                if isinstance(content, str):
                    last_text = content
                elif isinstance(content, list):
                    parts = []
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            parts.append(block.get("text", ""))
                    if parts:
                        last_text = "\n".join(parts)
        except Exception:
            continue

print(last_text)
PY
)"

if [ -z "$LAST_MSG" ]; then
  exit 0
fi

# ── 마지막 사용자 메시지 추출 (router trace용) ────────────────
LAST_USER_MSG="$(python3 - "$TRANSCRIPT_PATH" <<'PY'
import sys, json

transcript_path = sys.argv[1]
last_text = ""

with open(transcript_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            role = obj.get("role", "")
            if role == "user":
                content = obj.get("content", "")
                if isinstance(content, str):
                    last_text = content
                elif isinstance(content, list):
                    parts = []
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            parts.append(block.get("text", ""))
                    if parts:
                        last_text = "\n".join(parts)
        except Exception:
            continue

print(last_text)
PY
)"

HARNESS_GUARD="$ROOT/scripts/hooks/on-response.sh"
if [ -x "$HARNESS_GUARD" ] || [ -f "$HARNESS_GUARD" ]; then
  AI_SYSTEM_LAST_MSG="$LAST_MSG" bash "$HARNESS_GUARD" || true
fi

# ── 유틸 ─────────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
  echo "[hook] $*" >&2
}

# ── TAG 감지 함수 ─────────────────────────────────────────────
has_tag() {
  echo "$LAST_MSG" | grep -qiE "$1"
}

extract_tag() {
  echo "$LAST_MSG" | grep -oiE "$1" | head -1
}

# ════════════════════════════════════════════════════════════
#  0. [ROUTER] → router execution trace 자동 기록
#     Claude Code transcript 기반이라 tool call 자체는 관찰하지 못한다.
# ════════════════════════════════════════════════════════════
if has_tag '\[ROUTER\]'; then
  TRACE_SCRIPT="$ROOT/scripts/tracking/emit-router-trace.py"
  if [ -f "$TRACE_SCRIPT" ]; then
    AI_SYSTEM_LAST_MSG="$LAST_MSG" AI_SYSTEM_LAST_USER_MSG="$LAST_USER_MSG" python3 - "$ROOT" "$TRACE_SCRIPT" <<'PY' || true
from __future__ import annotations

import os
import re
import subprocess
import sys

root = sys.argv[1]
trace_script = sys.argv[2]
last_msg = os.environ.get("AI_SYSTEM_LAST_MSG", "")
last_user = os.environ.get("AI_SYSTEM_LAST_USER_MSG", "")


def first(pattern: str, default: str = "") -> str:
    match = re.search(pattern, last_msg, re.I | re.M)
    if not match:
        return default
    return match.group(1).strip()


def has(pattern: str) -> bool:
    return re.search(pattern, last_msg, re.I | re.M) is not None


def lines_for_tag(tag: str) -> list[str]:
    values = []
    pattern = re.compile(rf"\[{re.escape(tag)}\]\s*:\s*([^\n]+)", re.I)
    for match in pattern.finditer(last_msg):
        value = match.group(1).strip()
        if value:
            values.append(value)
    return values


inferred_phase = first(r"^- inferred_phase:\s*(.+)$", "unknown")
if inferred_phase == "unknown":
    if has(r"\[GATE\]"):
        inferred_phase = "Phase 4 Execution Gate"
    elif has(r"\[JUDGMENT\]"):
        inferred_phase = "Phase 7 Execution Review"
    elif has(r"\[ITERATION_SCOPE\]"):
        inferred_phase = "Phase 2 Scope/Iteration"
    elif has(r"\[IMPLEMENTATION_START\]|\[IMPLEMENTATION_COMPLETE\]"):
        inferred_phase = "Phase 6 Implementation"

if has(r"\[GATE\]"):
    block_type = "gate"
elif has(r"\[JUDGMENT\]"):
    block_type = "review"
elif has(r"\[ITERATION_SCOPE\]"):
    block_type = "iteration"
elif has(r"\[IMPLEMENTATION_START\]|\[IMPLEMENTATION_COMPLETE\]"):
    block_type = "implementation"
elif has(r"\[TASK_BREAKDOWN_READY\]"):
    block_type = "task_breakdown"
elif has(r"\[DECISION\]"):
    block_type = "decision"
else:
    block_type = "other"

status = "completed"
if has(r"\[GATE\]\s*:\s*HOLD|\[JUDGMENT\]\s*:\s*(보류|중단)|\[.*\]\s*:\s*FAIL"):
    status = "blocked"
elif has(r"\[TRACE_GAP\]"):
    status = "partial"

evidence_paths = lines_for_tag("EVIDENCE")
gaps = ["auto_hook_cannot_observe_tool_calls"]
if not evidence_paths:
    gaps.append("no_explicit_evidence_tag")

cmd = [
    sys.executable,
    trace_script,
    "--repo-root",
    root,
    "--request-text",
    last_user or "(unknown user message)",
    "--request-summary",
    first(r"^\[REASON\]:\s*(.+)$", "auto trace from on-response hook"),
    "--inferred-phase",
    inferred_phase,
    "--router-block-type",
    block_type,
    "--status",
    status,
    "--track",
    "builder",
    "--source-surface",
    "claude-code-hook",
    "--skills-considered",
    "ai-system-router",
    "--skills-used",
    "ai-system-router",
    "--scripts-run",
    ".claude/hooks/on-response.sh,scripts/tracking/emit-router-trace.py",
    "--files-read",
    ".claude/hooks/on-response.sh",
    "--files-written",
    "logs/router-execution-trace.jsonl",
    "--evidence-paths",
    ",".join(evidence_paths),
    "--gaps",
    ",".join(gaps),
]
subprocess.run(cmd, check=False)
PY
    log "ACTION: ROUTER trace emit 시도"
  else
    log "WARN: emit-router-trace.py 없음 — ROUTER trace 건너뜀"
  fi
fi

# ════════════════════════════════════════════════════════════
#  1. [DECISION]: GO  →  decision-lock.md 자동 생성
# ════════════════════════════════════════════════════════════
if has_tag '\[DECISION\]\s*:\s*GO'; then
  LOCK_FILE="$ROOT/decision-lock.md"
  if [ ! -f "$LOCK_FILE" ]; then
    REASON="$(echo "$LAST_MSG" | grep -A2 -i '\[REASON\]' | tail -n2 | head -1 | sed 's/^[[:space:]]*//' || echo "AI Decision 판정 GO")"
    cat > "$LOCK_FILE" <<LOCK
# Decision Lock

> 자동 생성: Claude Stop Hook
> 생성 일시: $(date '+%Y-%m-%d %H:%M:%S')

## 판정 결과

**[DECISION]: GO**

## 근거

$REASON

## 잠금 선언

이 파일이 존재하는 한 MVP 범위는 고정됩니다.
Execution Phase 진입이 허용됩니다.

---
*이 파일은 \`[DECISION]: GO\` 응답을 감지해 자동 생성되었습니다.*
LOCK
    log "ACTION: decision-lock.md 자동 생성 (DECISION: GO 감지)"

    # ── 첫 가치 신호 emit (first_decision_created) — privacy-safe 기본 ON, best-effort ──
    # 이 이벤트가 퍼널의 "first value" 핵심 지표(usage-report/nudge 세그먼트가 읽음).
    [ -x "$ROOT/.claude/hooks/usage-emit.sh" ] && \
      bash "$ROOT/.claude/hooks/usage-emit.sh" first_decision_created "" command=decision runtime=claude_code result=success tool_family=claude_code 2>/dev/null || true

    # ── GitHub 이슈 자동 생성 (gh 사용 가능 + 인증된 경우만) ──
    if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
      PROJECT_NAME="$(basename "$ROOT")"
      ISSUE_TITLE="[DECISION:GO] $PROJECT_NAME — $(date '+%Y-%m-%d')"
      ISSUE_BODY="decision-lock.md 자동 생성됨.

\`\`\`
$REASON
\`\`\`

> 자동 생성: on-response.sh Stop hook"
      gh issue create --title "$ISSUE_TITLE" --body "$ISSUE_BODY" --label "decision" 2>/dev/null \
        && log "ACTION: GitHub 이슈 생성 완료 (DECISION:GO)" \
        || log "WARN: GitHub 이슈 생성 실패 (권한 또는 repo 설정 확인)"
    else
      log "SKIP: gh 미인증 — GitHub 이슈 생성 건너뜀 (gh auth login 필요)"
    fi
  else
    log "SKIP: decision-lock.md 이미 존재"
  fi
fi

# ════════════════════════════════════════════════════════════
#  2. [TASK_COMPLETE]: T-XX  →  task-list.md 상태 업데이트
# ════════════════════════════════════════════════════════════
COMPLETED_TASKS="$(echo "$LAST_MSG" | grep -oiE '\[TASK_COMPLETE\]\s*:\s*(TASK-|T-|#)[0-9]+' | grep -oiE '(TASK-|T-|#)[0-9]+' || true)"

if [ -n "$COMPLETED_TASKS" ]; then
  TASK_FILE="$ROOT/tasks/task-list.md"
  if [ -f "$TASK_FILE" ]; then
    for TASK_ID in $COMPLETED_TASKS; do
      TASK_UPPER="$(echo "$TASK_ID" | tr '[:lower:]' '[:upper:]')"
      # [ ] → [x] 또는 상태 텍스트 업데이트
      if grep -q "$TASK_UPPER" "$TASK_FILE"; then
        sed -i '' "s/\[ \] .*${TASK_UPPER}/[x] \0/" "$TASK_FILE" 2>/dev/null \
          || sed -i "s/\[ \] .*${TASK_UPPER}/[x] \0/" "$TASK_FILE" 2>/dev/null \
          || true
        log "ACTION: task-list.md — $TASK_UPPER 완료 처리"
      else
        log "SKIP: $TASK_UPPER 가 task-list.md에 없음"
      fi
    done
  fi
fi

# ════════════════════════════════════════════════════════════
#  3. [SECURITY_VIOLATION]  →  경고 파일 생성 + 진행 차단 신호
# ════════════════════════════════════════════════════════════
if has_tag '\[SECURITY_VIOLATION\]'; then
  WARN_DIR="$ROOT/logs/security"
  mkdir -p "$WARN_DIR"
  WARN_FILE="$WARN_DIR/violation-$(date '+%Y%m%d-%H%M%S').md"
  VIOLATION_TYPE="$(extract_tag '\[SECURITY_VIOLATION\]\s*:\s*[^\n]+')"

  cat > "$WARN_FILE" <<WARN
# Security Violation Detected

> 자동 기록: Claude Stop Hook
> 감지 일시: $(date '+%Y-%m-%d %H:%M:%S')

## 위반 유형

${VIOLATION_TYPE:-[SECURITY_VIOLATION] 감지됨}

## 원본 응답 (발췌)

\`\`\`
$(echo "$LAST_MSG" | grep -A5 -i 'SECURITY_VIOLATION' | head -10)
\`\`\`

## 조치 필요

- [ ] 위반 내용 검토
- [ ] 민감 정보 노출 여부 확인
- [ ] 커밋/배포 중단 확인
WARN

  log "ACTION: 보안 위반 기록 → $WARN_FILE"
  # 비어있지 않은 exit code로 Claude Code에 차단 신호 전달
  # (hook이 non-zero를 반환하면 다음 자동 실행을 멈춤)
  exit 2
fi

# ════════════════════════════════════════════════════════════
#  4. [JUDGMENT]: 종료  →  release-manager 호출 힌트 기록
# ════════════════════════════════════════════════════════════
if has_tag '\[JUDGMENT\]\s*:\s*종료'; then
  NEXT_FILE="$ROOT/logs/hooks/pending-actions.md"
  mkdir -p "$(dirname "$NEXT_FILE")"
  cat >> "$NEXT_FILE" <<NEXT

## $(date '+%Y-%m-%d %H:%M:%S') — JUDGMENT: 종료 감지

다음 액션을 실행하세요:
\`\`\`
@release-manager
\`\`\`
또는 \`release-ops-bridge\` 스킬 실행

NEXT
  log "ACTION: JUDGMENT 종료 감지 → pending-actions.md에 release-manager 힌트 기록"
fi

# ════════════════════════════════════════════════════════════
#  5. [JUDGMENT]: 피벗  →  task-list 리셋 힌트 기록
# ════════════════════════════════════════════════════════════
if has_tag '\[JUDGMENT\]\s*:\s*피벗'; then
  NEXT_FILE="$ROOT/logs/hooks/pending-actions.md"
  mkdir -p "$(dirname "$NEXT_FILE")"
  cat >> "$NEXT_FILE" <<NEXT

## $(date '+%Y-%m-%d %H:%M:%S') — JUDGMENT: 피벗 감지

다음 액션을 실행하세요:
1. \`decision-lock.md\` 삭제 후 /decision 재실행
2. \`tasks/task-list.md\` 피벗 사유 기록
3. Phase 4 재진입

NEXT
  log "ACTION: JUDGMENT 피벗 감지 → pending-actions.md에 재진입 힌트 기록"
fi

# ════════════════════════════════════════════════════════════
#  6. [IMPLEMENTATION_COMPLETE]: TASK-XX
#     → execution-context 업데이트 + testgen 트리거 힌트
# ════════════════════════════════════════════════════════════
IMPL_COMPLETE="$(echo "$LAST_MSG" | grep -oiE '\[IMPLEMENTATION_COMPLETE\]\s*:\s*[A-Z0-9#-]+' | head -1 || true)"
if [ -n "$IMPL_COMPLETE" ]; then
  TASK_ID="$(echo "$IMPL_COMPLETE" | grep -oiE '[A-Z0-9#-]+$' || true)"
  STATE_DIR="$ROOT/docs/state"
  CTX_FILE="$STATE_DIR/execution-context.md"
  mkdir -p "$STATE_DIR"

  # execution-context 업데이트
  if [ -f "$CTX_FILE" ]; then
    sed -i '' 's/status: implementing/status: test_required/' "$CTX_FILE" 2>/dev/null \
      || sed -i 's/status: implementing/status: test_required/' "$CTX_FILE" 2>/dev/null \
      || true
    sed -i '' 's/implementation:\n    done: false/implementation:\n    done: true/' "$CTX_FILE" 2>/dev/null \
      || true
  else
    # 신규 생성
    cat > "$CTX_FILE" <<CTX
# Execution Context (자동 생성)
# 생성: $(date '+%Y-%m-%d %H:%M:%S')
task_id: "$TASK_ID"
status: test_required
agent_chain:
  implementation:
    done: true
  test:
    status: pending
    retries: 0
CTX
  fi

  # testgen 트리거 힌트
  NEXT_FILE="$ROOT/logs/hooks/pending-actions.md"
  mkdir -p "$(dirname "$NEXT_FILE")"
  cat >> "$NEXT_FILE" <<NEXT

## $(date '+%Y-%m-%d %H:%M:%S') — IMPLEMENTATION_COMPLETE: $TASK_ID

다음 체인을 자동 실행하세요:
1. testgen-automation 스킬 실행 → 테스트 생성
2. 생성된 테스트 실행
3. 결과에 따라 [TEST_RESULT]: PASS/FAIL 태그 출력
4. FAIL 시 healer-automation 자동 진입

NEXT
  log "ACTION: IMPLEMENTATION_COMPLETE 감지 ($TASK_ID) → execution-context 업데이트 + testgen 힌트 기록"
fi

# ════════════════════════════════════════════════════════════
#  7. [TEST_RESULT]: PASS/FAIL TASK-XX
#     → PASS: task done 처리 + evidence 등록
#     → FAIL: healer 재진입 힌트
# ════════════════════════════════════════════════════════════
TEST_RESULT="$(echo "$LAST_MSG" | grep -oiE '\[TEST_RESULT\]\s*:\s*(PASS|FAIL)[^\n]*' | head -1 || true)"
if [ -n "$TEST_RESULT" ]; then
  RESULT_STATUS="$(echo "$TEST_RESULT" | grep -oiE ':\s*(PASS|FAIL)' | grep -oiE 'PASS|FAIL' || true)"
  RESULT_TASK="$(echo "$TEST_RESULT" | grep -oiE '[A-Z0-9#-]+$' || true)"
  CTX_FILE="$ROOT/docs/state/execution-context.md"

  if [ "$RESULT_STATUS" = "PASS" ]; then
    # execution-context: test.status → pass
    if [ -f "$CTX_FILE" ]; then
      sed -i '' 's/status: test_running/status: done/' "$CTX_FILE" 2>/dev/null \
        || sed -i 's/status: test_running/status: done/' "$CTX_FILE" 2>/dev/null \
        || true
      sed -i '' 's/    status: pending/    status: pass/' "$CTX_FILE" 2>/dev/null \
        || sed -i 's/    status: pending/    status: pass/' "$CTX_FILE" 2>/dev/null \
        || true
    fi

    # evidence registry 업데이트
    EVIDENCE_FILE="$ROOT/docs/state/evidence-registry.md"
    mkdir -p "$(dirname "$EVIDENCE_FILE")"
    if [ ! -f "$EVIDENCE_FILE" ]; then
      echo "# Evidence Registry" > "$EVIDENCE_FILE"
      echo "> 자동 누적: on-response.sh" >> "$EVIDENCE_FILE"
      echo "" >> "$EVIDENCE_FILE"
    fi
    echo "- $(date '+%Y-%m-%d %H:%M:%S') | $RESULT_TASK | TEST_PASS | verified:true" >> "$EVIDENCE_FILE"
    log "ACTION: TEST_RESULT PASS ($RESULT_TASK) → execution-context 완료 처리 + evidence 등록"

  elif [ "$RESULT_STATUS" = "FAIL" ]; then
    # execution-context: retries 증가
    if [ -f "$CTX_FILE" ]; then
      sed -i '' 's/    status: pending/    status: fail/' "$CTX_FILE" 2>/dev/null \
        || sed -i 's/    status: pending/    status: fail/' "$CTX_FILE" 2>/dev/null \
        || true
    fi

    # healer 재진입 힌트
    NEXT_FILE="$ROOT/logs/hooks/pending-actions.md"
    mkdir -p "$(dirname "$NEXT_FILE")"
    cat >> "$NEXT_FILE" <<HEAL

## $(date '+%Y-%m-%d %H:%M:%S') — TEST_RESULT FAIL: $RESULT_TASK

healer-automation 자동 재진입:
1. 실패한 테스트 케이스 식별
2. @healer 에이전트로 근본 원인 분석
3. 수정 적용 후 테스트 재실행
4. 최대 2회 재시도 (execution-context.md 의 retries 확인)

HEAL
    log "ACTION: TEST_RESULT FAIL ($RESULT_TASK) → healer 재진입 힌트 기록"
  fi
fi

# ════════════════════════════════════════════════════════════
#  8. [ANALYSIS_COMPLETE]: TASK-XX
#     → execution-context analysis.done = true + 구현 게이트 해제 힌트
# ════════════════════════════════════════════════════════════
ANALYSIS_COMPLETE="$(echo "$LAST_MSG" | grep -oiE '\[ANALYSIS_COMPLETE\]\s*:\s*[A-Z0-9#-]+' | head -1 || true)"
if [ -n "$ANALYSIS_COMPLETE" ]; then
  TASK_ID="$(echo "$ANALYSIS_COMPLETE" | grep -oiE '[A-Z0-9#-]+$' || true)"
  CTX_FILE="$ROOT/docs/state/execution-context.md"
  mkdir -p "$(dirname "$CTX_FILE")"

  if [ -f "$CTX_FILE" ]; then
    sed -i '' 's/status: analysis_required/status: analysis_done/' "$CTX_FILE" 2>/dev/null \
      || sed -i 's/status: analysis_required/status: analysis_done/' "$CTX_FILE" 2>/dev/null \
      || true
    sed -i '' 's/    done: false$/    done: true/' "$CTX_FILE" 2>/dev/null \
      || true
  else
    cat > "$CTX_FILE" <<CTX
# Execution Context (자동 생성)
# 생성: $(date '+%Y-%m-%d %H:%M:%S')
task_id: "$TASK_ID"
status: analysis_done
agent_chain:
  analysis:
    done: true
  implementation:
    done: false
    blocked_until: analysis_done
  test:
    status: pending
CTX
  fi
  log "ACTION: ANALYSIS_COMPLETE 감지 ($TASK_ID) → execution-context analysis.done=true"
fi

# ════════════════════════════════════════════════════════════
#  9. [EVIDENCE]: path/to/file
#     → evidence-registry.md에 산출물 누적
# ════════════════════════════════════════════════════════════
EVIDENCE_TAGS="$(echo "$LAST_MSG" | grep -oiE '^\[EVIDENCE\][[:space:]]*:[[:space:]]*.*$' || true)"
if [ -n "$EVIDENCE_TAGS" ]; then
  EVIDENCE_FILE="$ROOT/docs/state/evidence-registry.md"
  mkdir -p "$(dirname "$EVIDENCE_FILE")"
  if [ ! -f "$EVIDENCE_FILE" ]; then
    echo "# Evidence Registry" > "$EVIDENCE_FILE"
    echo "> 자동 누적: on-response.sh" >> "$EVIDENCE_FILE"
    echo "" >> "$EVIDENCE_FILE"
  fi
  while IFS= read -r line; do
    ARTIFACT="$(echo "$line" | sed -E 's/^\[EVIDENCE\][[:space:]]*:[[:space:]]*//' || true)"
    echo "- $(date '+%Y-%m-%d %H:%M:%S') | EVIDENCE | $ARTIFACT" >> "$EVIDENCE_FILE"
    log "ACTION: EVIDENCE 등록 → $ARTIFACT"
  done <<< "$EVIDENCE_TAGS"
fi

# ════════════════════════════════════════════════════════════
# 10. [PHASE_TRANSITION]: from→to TASK-XX
#     → phase-transition-log.md 자동 누적
# ════════════════════════════════════════════════════════════
PHASE_TRANS="$(echo "$LAST_MSG" | grep -oiE '\[PHASE_TRANSITION\]\s*:\s*[^\n]+' | head -1 || true)"
if [ -n "$PHASE_TRANS" ]; then
  TRANS_BODY="$(echo "$PHASE_TRANS" | sed 's/\[PHASE_TRANSITION\]\s*:\s*//' || true)"
  TRANS_LOG="$ROOT/docs/state/phase-transition-log.md"
  mkdir -p "$(dirname "$TRANS_LOG")"
  if [ ! -f "$TRANS_LOG" ]; then
    printf '# Phase Transition Log

| timestamp | transition | detail |
|-----------|-----------|--------|
' > "$TRANS_LOG"
  fi
  printf '| %s | %s | hook-detected |
' "$(date '+%Y-%m-%d %H:%M:%S')" "$TRANS_BODY" >> "$TRANS_LOG"
  log "ACTION: PHASE_TRANSITION 감지 → phase-transition-log.md 기록"
fi

# ════════════════════════════════════════════════════════════
# 11. [HEALER_ESCALATE] → pending-actions에 수동 검토 요청
# ════════════════════════════════════════════════════════════
if has_tag '\[HEALER_ESCALATE\]'; then
  NEXT_FILE="$ROOT/logs/hooks/pending-actions.md"
  mkdir -p "$(dirname "$NEXT_FILE")"
  cat >> "$NEXT_FILE" <<'ESCMSG'

## AUTO-HEALER_ESCALATE — 수동 검토 필요
자동 재시도(2회) 소진. 실패한 테스트 케이스 직접 확인 후 @healer 재실행 또는 Task를 blocked 처리.
ESCMSG
  log "ACTION: HEALER_ESCALATE 감지 → pending-actions.md에 수동 검토 요청"
fi

# ════════════════════════════════════════════════════════════
# 12. current-snapshot.md 자동 갱신 (무조건 실행 — 태그 독립)
#     매 세션 종료 시 날짜 + git 최신 커밋 + Task 현황을 갱신한다.
#     태그 감지와 무관하게 항상 실행되어 신선도를 보장한다.
# ════════════════════════════════════════════════════════════
SNAPSHOT_FILE="$ROOT/docs/state/current-snapshot.md"
TODAY="$(date '+%Y-%m-%d')"
TASK_FILE="$ROOT/tasks/task-list.md"

DONE_COUNT=0
IN_PROGRESS_COUNT=0
if [ -f "$TASK_FILE" ]; then
  DONE_COUNT="$(grep -c '| done' "$TASK_FILE" 2>/dev/null || echo 0)"
  IN_PROGRESS_COUNT="$(grep -c '| in_progress' "$TASK_FILE" 2>/dev/null || echo 0)"
fi

LAST_COMMIT="$(git -C "$ROOT" log -1 --oneline 2>/dev/null || echo "unknown")"
LAST_COMMIT_DATE="$(git -C "$ROOT" log -1 --format='%ci' 2>/dev/null | cut -d' ' -f1 || echo "unknown")"

mkdir -p "$(dirname "$SNAPSHOT_FILE")"

if [ -f "$SNAPSHOT_FILE" ]; then
  # 날짜 항상 갱신
  sed -i '' "s/^업데이트: .*/업데이트: $TODAY/" "$SNAPSHOT_FILE" 2>/dev/null \
    || sed -i "s/^업데이트: .*/업데이트: $TODAY/" "$SNAPSHOT_FILE" 2>/dev/null \
    || true
  # 최근 커밋 정보 갱신
  sed -i '' "s/^최근 커밋: .*/최근 커밋: $LAST_COMMIT/" "$SNAPSHOT_FILE" 2>/dev/null \
    || sed -i "s/^최근 커밋: .*/최근 커밋: $LAST_COMMIT/" "$SNAPSHOT_FILE" 2>/dev/null \
    || true
  sed -i '' "s/^완료: [0-9]*/완료: $DONE_COUNT/" "$SNAPSHOT_FILE" 2>/dev/null \
    || sed -i "s/^완료: [0-9]*/완료: $DONE_COUNT/" "$SNAPSHOT_FILE" 2>/dev/null \
    || true
  sed -i '' "s/^진행 중: [0-9]*/진행 중: $IN_PROGRESS_COUNT/" "$SNAPSHOT_FILE" 2>/dev/null \
    || sed -i "s/^진행 중: [0-9]*/진행 중: $IN_PROGRESS_COUNT/" "$SNAPSHOT_FILE" 2>/dev/null \
    || true
else
  cat > "$SNAPSHOT_FILE" <<SNAP
# 실행 상태 스냅샷

> on-response.sh 자동 갱신 (세션 종료 시 무조건 실행)

업데이트: $TODAY
최근 커밋: $LAST_COMMIT
현재 Phase: 운영 중 (전사 감사 완료, 랜딩 리디자인 완료)

## Task 현황

완료: ${DONE_COUNT}개
진행 중: ${IN_PROGRESS_COUNT}개

## 다음 액션
→ task-list.md 확인
SNAP
fi

log "ACTION: current-snapshot.md 갱신 (${TODAY}, done:${DONE_COUNT}, in_progress:${IN_PROGRESS_COUNT}, commit:${LAST_COMMIT_DATE})"

# ════════════════════════════════════════════════════════════
# 13. 스냅샷 신선도 체크 — 7일 초과 시 [SNAPSHOT_STALE] 경고
# ════════════════════════════════════════════════════════════
if [ -f "$SNAPSHOT_FILE" ]; then
  SNAP_DATE="$(grep -oE '^업데이트: [0-9]{4}-[0-9]{2}-[0-9]{2}' "$SNAPSHOT_FILE" 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1 || echo "")"
  if [ -n "$SNAP_DATE" ]; then
    TODAY_EPOCH="$(date '+%s')"
    SNAP_EPOCH="$(date -j -f '%Y-%m-%d' "$SNAP_DATE" '+%s' 2>/dev/null \
      || date -d "$SNAP_DATE" '+%s' 2>/dev/null || echo "$TODAY_EPOCH")"
    DIFF_DAYS=$(( (TODAY_EPOCH - SNAP_EPOCH) / 86400 ))
    if [ "$DIFF_DAYS" -gt 7 ]; then
      STALE_FILE="$ROOT/logs/hooks/pending-actions.md"
      mkdir -p "$(dirname "$STALE_FILE")"
      cat >> "$STALE_FILE" <<STALE

## $(date '+%Y-%m-%d %H:%M:%S') — [SNAPSHOT_STALE] 경고
current-snapshot.md 마지막 갱신: ${SNAP_DATE} (${DIFF_DAYS}일 경과)
세션 재진입 신뢰도 저하 위험. task-list.md 기준으로 수동 갱신 권장.

STALE
      log "WARN: [SNAPSHOT_STALE] snapshot이 ${DIFF_DAYS}일 뒤처짐 (${SNAP_DATE})"
    fi
  fi
fi

# ════════════════════════════════════════════════════════════
# 14. Evidence Registry 자동 수집 (세션 종료 시 무조건 실행)
#     git diff HEAD~1 기반으로 실제 변경된 파일을 evidence로 자동 등록
# ════════════════════════════════════════════════════════════
EVIDENCE_FILE="$ROOT/docs/state/evidence-registry.md"
mkdir -p "$(dirname "$EVIDENCE_FILE")"

if [ ! -f "$EVIDENCE_FILE" ] || [ ! -s "$EVIDENCE_FILE" ]; then
  cat > "$EVIDENCE_FILE" <<EVH
# Evidence Registry

> 자동 누적: on-response.sh — 태그 감지 + git diff 기반

| timestamp | type | artifact | commit |
|-----------|------|----------|--------|
EVH
fi

CHANGED_FILES="$(git -C "$ROOT" diff --name-only HEAD~1 HEAD 2>/dev/null | head -5 || true)"
LATEST_COMMIT_HASH="$(git -C "$ROOT" log -1 --format='%h' 2>/dev/null || echo "unknown")"

if [ -n "$CHANGED_FILES" ]; then
  while IFS= read -r changed_file; do
    [ -z "$changed_file" ] && continue
    if ! grep -q "$LATEST_COMMIT_HASH.*$changed_file" "$EVIDENCE_FILE" 2>/dev/null; then
      printf '| %s | GIT_CHANGE | %s | %s |\n' \
        "$(date '+%Y-%m-%d %H:%M:%S')" \
        "$changed_file" \
        "$LATEST_COMMIT_HASH" >> "$EVIDENCE_FILE"
    fi
  done <<< "$CHANGED_FILES"
  log "ACTION: evidence-registry.md 갱신 (git diff 기반)"
fi

# [FEEDBACK_PRIORITIZED] → /decision 힌트 기록
if has_tag '\[FEEDBACK_PRIORITIZED\]'; then
  NEXT_FILE="$ROOT/logs/hooks/pending-actions.md"
  mkdir -p "$(dirname "$NEXT_FILE")"
  printf '\n## %s — [FEEDBACK_PRIORITIZED] 감지\n피드백 우선순위 완료. → /decision 실행해서 다음 Iteration 스코프 확정.\n\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" >> "$NEXT_FILE"
  log "ACTION: [FEEDBACK_PRIORITIZED] 감지 → /decision 힌트 기록"
fi

# ════════════════════════════════════════════════════════════
# 15. clear-safe 체크포인트 자동 생성
#     Task 완료 또는 종료 판정 시 /clear 전에 재진입 상태를 저장한다.
#     실제 /clear는 실행하지 않는다.
# ════════════════════════════════════════════════════════════
if has_tag '\[TASK_COMPLETE\]' || has_tag '\[JUDGMENT\]\s*:\s*종료'; then
  CLEAR_SAFE_SCRIPT="$ROOT/scripts/clear-safe.py"
  NEXT_FILE="$ROOT/logs/hooks/pending-actions.md"
  mkdir -p "$(dirname "$NEXT_FILE")"

  if [ -f "$CLEAR_SAFE_SCRIPT" ]; then
    REASON="hook-task-complete"
    if has_tag '\[JUDGMENT\]\s*:\s*종료'; then
      REASON="hook-judgment-end"
    fi

    CLEAR_SAFE_OUTPUT="$(python3 "$CLEAR_SAFE_SCRIPT" --reason "$REASON" 2>&1 || true)"
    cat >> "$NEXT_FILE" <<CLEARSAFE

## $(date '+%Y-%m-%d %H:%M:%S') — [CLEAR_SAFE] 자동 체크포인트

\`\`\`text
$CLEAR_SAFE_OUTPUT
\`\`\`

clear 후 복원 프롬프트:
\`\`\`text
현재 레포 기준으로 컨텍스트 복원해.
docs/state/clear-safe-latest.md, docs/state/current-snapshot.md, tasks/task-list.md, docs/state/evidence-registry.md를 먼저 읽고 이어서 진행해.
\`\`\`

CLEARSAFE
    log "ACTION: clear-safe 체크포인트 생성 (${REASON})"
  else
    log "WARN: clear-safe.py 없음 — 체크포인트 생성 건너뜀"
  fi
fi

# privacy-safe 운영 텔레메트리 (기본 ON, opt-out 가능, 실패해도 훅에 영향 없음)
if [ -x "$ROOT/.claude/hooks/usage-emit.sh" ]; then
  # 직무/업무 맥락 추론 — LAST_MSG 원문은 로컬에서만 읽고, 서버에는 enum 토큰만 보낸다.
  USAGE_CONTEXT="$(
    AI_SYSTEM_LAST_MSG="$LAST_MSG" python3 - <<'PY'
from __future__ import annotations

import os
import re
import shlex

msg = os.environ.get("AI_SYSTEM_LAST_MSG", "")
low = msg.lower()


def has(pattern: str) -> bool:
    return re.search(pattern, msg, re.I | re.M) is not None


def clean(value: str, fallback: str = "") -> str:
    value = re.sub(r"[^A-Za-z0-9_.:-]", "", value or "")
    return (value[:80] or fallback)


phase = ""
task_kind = "general"
workflow_stage = ""
skill_id = ""
agent_id = ""

if has(r"\[ITERATION_SCOPE\]"):
    phase, task_kind, workflow_stage = "2", "scope_iteration", "scope"
elif has(r"\[DECISION\]"):
    phase, task_kind, workflow_stage = "1", "decision", "decision"
elif has(r"\[GATE\]"):
    phase, task_kind, workflow_stage = "4", "execution_gate", "gate"
elif has(r"\[IMPLEMENTATION_COMPLETE\]|\[IMPLEMENTATION_START\]"):
    phase, task_kind, workflow_stage = "6", "implementation", "build"
elif has(r"\[JUDGMENT\]"):
    phase, task_kind, workflow_stage = "7", "review", "review"
elif has(r"\[PRE_LAUNCH_FINAL_AUDIT\]"):
    phase, task_kind, workflow_stage = "8", "pre_launch_audit", "release"

agent_match = re.search(r"(^|[\s(])@([A-Za-z0-9_.-]{3,80})", msg)
if agent_match:
    agent_id = clean(agent_match.group(2))

tag_to_agent = [
    (r"\[SECURITY_TEST_RESULT\]", "security-tester", "application-security-audit", "security_audit", "security"),
    (r"\[UX_GATE", "ux-gate", "ux-gate-automation", "ux_review", "ux"),
    (r"\[DEV_AUDIT_RESULT\]", "dev-auditor", "technical-review-automation", "technical_review", "engineering"),
    (r"\[CODE_QUALITY_REPORT\]", "code-quality", "code-review-automation", "code_review", "engineering"),
    (r"\[TESTOPS_REPORT\]", "testops", "testops-automation", "test_review", "qa"),
    (r"\[GTM_STRATEGY_RESULT\]", "gtm-strategist", "web-marketing-funnel-audit", "gtm_review", "marketing"),
    (r"\[EVENT_SCHEMA_DESIGN\]", "event-schema-designer", "tracking-integrity-audit", "event_design", "data"),
    (r"\[PRODUCT_DIAGNOSIS\]", "product-diagnosis", "planning-review-automation", "product_diagnosis", "product"),
    (r"\[BUSINESS_VISUALIZATION\]", "business-visualization-architect", "", "visualization", "business"),
    (r"\[DEPLOYMENT", "deployment", "release-ops-bridge", "deployment", "devops"),
    (r"\[ROUTER\]", "", "ai-system-router", task_kind if task_kind != "general" else "routing", "routing"),
]
job_role = ""
for pattern, agent, skill, kind, role in tag_to_agent:
    if has(pattern):
        agent_id = agent_id or agent
        skill_id = skill_id or skill
        task_kind = kind or task_kind
        job_role = role
        break

if not job_role:
    role_rules = [
        ("security", r"security|보안|owasp|secret|privacy|개인정보"),
        ("qa", r"qa|test|검증|테스트"),
        ("ux", r"ux|ui|온보딩|사용성"),
        ("data", r"ga4|analytics|event|tracking|telemetry|데이터"),
        ("marketing", r"marketing|seo|geo|aeo|gtm|마케팅"),
        ("devops", r"deploy|vercel|railway|배포|release|npm"),
        ("engineering", r"code|build|implementation|구현|개발"),
        ("product", r"product|pm|scope|mvp|기획"),
    ]
    for role, pattern in role_rules:
        if re.search(pattern, low, re.I):
            job_role = role
            break
job_role = job_role or "general"

if not workflow_stage:
    workflow_stage = {
        "security": "risk_review",
        "qa": "verification",
        "ux": "experience_review",
        "data": "measurement",
        "marketing": "growth",
        "devops": "release",
        "engineering": "build",
        "product": "planning",
    }.get(job_role, "general")

if not phase:
    phase = {
        "product": "2",
        "engineering": "6",
        "security": "7",
        "qa": "7",
        "ux": "7",
        "data": "7",
        "marketing": "8",
        "devops": "8",
    }.get(job_role, "")

if not skill_id:
    skill_match = re.search(r"(?:skill|스킬)\s*[:=]\s*([A-Za-z0-9_.-]{3,80})", msg, re.I)
    if skill_match:
        skill_id = clean(skill_match.group(1))

for key, value in {
    "USAGE_SKILL_ID": clean(skill_id),
    "USAGE_AGENT_ID": clean(agent_id),
    "USAGE_PHASE_ID": clean(phase, ""),
    "USAGE_JOB_ROLE": clean(job_role, "general"),
    "USAGE_TASK_KIND": clean(task_kind, "general"),
    "USAGE_WORKFLOW_STAGE": clean(workflow_stage, "general"),
}.items():
    print(f"{key}={shlex.quote(value)}")
PY
  )"
  eval "$USAGE_CONTEXT"
  bash "$ROOT/.claude/hooks/usage-emit.sh" session_active 2>/dev/null || true
  # command_used — 이번 응답에 라우터/커맨드/에이전트 신호가 감지되면 (이벤트명만 전송, 내용 X)
  if echo "$LAST_MSG" | grep -qiE '\[ROUTER\]|\[GATE\]|\[JUDGMENT\]|\[PROPOSAL_PIPELINE\]|(^|[[:space:]])/[a-z][a-z-]{2,}|(^|[[:space:]])@[a-z][a-z-]{2,}'; then
    bash "$ROOT/.claude/hooks/usage-emit.sh" command_used "$USAGE_SKILL_ID" runtime=claude_code result=success \
      agent_id="$USAGE_AGENT_ID" phase_id="$USAGE_PHASE_ID" job_role="$USAGE_JOB_ROLE" \
      task_kind="$USAGE_TASK_KIND" workflow_stage="$USAGE_WORKFLOW_STAGE" 2>/dev/null || true
  fi
  if [ -n "${USAGE_AGENT_ID:-}" ]; then
    bash "$ROOT/.claude/hooks/usage-emit.sh" agent_used "$USAGE_SKILL_ID" runtime=claude_code result=success \
      agent_id="$USAGE_AGENT_ID" phase_id="$USAGE_PHASE_ID" job_role="$USAGE_JOB_ROLE" \
      task_kind="$USAGE_TASK_KIND" workflow_stage="$USAGE_WORKFLOW_STAGE" 2>/dev/null || true
  fi
  if [ -n "${USAGE_SKILL_ID:-}" ]; then
    bash "$ROOT/.claude/hooks/usage-emit.sh" skill_used "$USAGE_SKILL_ID" runtime=claude_code result=success \
      agent_id="$USAGE_AGENT_ID" phase_id="$USAGE_PHASE_ID" job_role="$USAGE_JOB_ROLE" \
      task_kind="$USAGE_TASK_KIND" workflow_stage="$USAGE_WORKFLOW_STAGE" 2>/dev/null || true
  fi
fi

exit 0
