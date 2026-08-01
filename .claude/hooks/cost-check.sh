#!/usr/bin/env bash
# Cost Guard Pre-Tool-Use Hook
# Task 도구 호출 직전 실행되어 누적 비용을 추적하고 예산 초과 시 경고를 출력한다.
#
# Claude Code hooks는 stdin으로 JSON 컨텍스트를 받고, exit code로 결정:
#   0 = 통과
#   2 = 차단 (사용자에게 경고 표시)
#
# 동작:
# 1. stdin JSON에서 subagent_type 추출
# 2. 등급(S/A/B/C) 매핑 → 예상 토큰/비용 계산
# 3. docs/state/cost-tracking.md 누적 업데이트
# 4. 예산 초과 시 stderr로 경고 출력 (차단은 안 함, soft warn)

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TRACKING_FILE="${REPO_ROOT}/docs/state/cost-tracking.md"
USAGE_LOG="${REPO_ROOT}/logs/tracking/agent-calls.jsonl"
DEFAULT_BUDGET_SESSION="${COST_BUDGET_SESSION:-5.00}"

# stdin이 파이프가 아니면 (TTY 직접 호출) silent exit
if [ -t 0 ]; then
  exit 0
fi

# stdin 전체 읽기
INPUT_JSON=$(cat)
[ -z "$INPUT_JSON" ] && exit 0

ROUTER_PREFLIGHT="${REPO_ROOT}/scripts/hooks/router-preflight.sh"
if [ -f "$ROUTER_PREFLIGHT" ]; then
  printf '%s' "$INPUT_JSON" | AI_SYSTEM_HOOK_ROOT="$REPO_ROOT" bash "$ROUTER_PREFLIGHT"
  STATUS=$?
  if [ "$STATUS" -ne 0 ]; then
    exit "$STATUS"
  fi
fi

# subagent_type 추출 (jq가 있으면 사용, 없으면 grep)
SUBAGENT=""
if command -v jq >/dev/null 2>&1; then
  SUBAGENT=$(echo "$INPUT_JSON" | jq -r '.tool_input.subagent_type // empty' 2>/dev/null)
else
  SUBAGENT=$(echo "$INPUT_JSON" | grep -oE '"subagent_type"\s*:\s*"[^"]+"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
fi

[ -z "$SUBAGENT" ] && exit 0

# 등급 매핑
case "$SUBAGENT" in
  architecture|expert-planner|dev-auditor|product-diagnosis|enterprise-pilot-manager|execution-review)
    GRADE="S"; EST_TOKENS=8000; EST_COST="0.08"
    ;;
  screen-designer|api-designer|db-designer|task-breakdown|stack-advisor|gtm-strategist)
    GRADE="A"; EST_TOKENS=5000; EST_COST="0.05"
    ;;
  decision|mvp-builder|testgen|healer|code-quality|implementation|code-analyzer)
    GRADE="B"; EST_TOKENS=3000; EST_COST="0.03"
    ;;
  *)
    GRADE="C"; EST_TOKENS=1500; EST_COST="0.015"
    ;;
esac

# 누적 추적 파일 생성/갱신
mkdir -p "$(dirname "$TRACKING_FILE")"

if [ ! -f "$TRACKING_FILE" ]; then
  cat > "$TRACKING_FILE" <<EOF
# Cost Tracking

session_start: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
budget_per_session: ${DEFAULT_BUDGET_SESSION}

cumulative:
  session_total: 0.00
  agent_calls: []
EOF
fi

# 누적 비용 업데이트
CURRENT_TOTAL=$(grep -oE 'session_total: [0-9.]+' "$TRACKING_FILE" | head -1 | awk '{print $2}')
[ -z "$CURRENT_TOTAL" ] && CURRENT_TOTAL="0.00"

NEW_TOTAL=$(awk -v a="$CURRENT_TOTAL" -v b="$EST_COST" 'BEGIN{printf "%.4f", a+b}')

# 예산 비교
BUDGET_NUM=$(echo "$DEFAULT_BUDGET_SESSION" | awk '{print $1+0}')
WARN_THRESHOLD=$(awk -v b="$BUDGET_NUM" 'BEGIN{print b*0.8}')

# 추적 기록 (간단 append)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "    - { agent: \"@${SUBAGENT}\", grade: ${GRADE}, est_cost: ${EST_COST}, ts: \"${TIMESTAMP}\" }" >> "$TRACKING_FILE"

# ─── 사용 빈도 로그 (NDJSON) ─────────────────────────
# 분석 데이터 기반 통폐합 의사결정을 위한 호출 이력 저장
mkdir -p "$(dirname "$USAGE_LOG")"
cat >> "$USAGE_LOG" <<EOF
{"ts":"${TIMESTAMP}","agent":"${SUBAGENT}","grade":"${GRADE}","est_tokens":${EST_TOKENS},"est_cost":${EST_COST},"session_total":${NEW_TOTAL}}
EOF

# session_total 업데이트
sed -i.bak "s/session_total: [0-9.]*/session_total: ${NEW_TOTAL}/" "$TRACKING_FILE"
rm -f "${TRACKING_FILE}.bak"

# 예산 초과/경고 메시지
if awk -v t="$NEW_TOTAL" -v b="$BUDGET_NUM" 'BEGIN{exit !(t > b)}'; then
  echo "[COST_GUARD] HOLD — 누적 \$${NEW_TOTAL} > 예산 \$${BUDGET_NUM}" >&2
  echo "[COST_GUARD] 다음 호출(@${SUBAGENT}, ${GRADE}, ~\$${EST_COST}) 차단됨" >&2
  echo "[COST_GUARD] 대안: 예산 증액(COST_BUDGET_SESSION=10) 또는 호출 스킵" >&2
  if [ "$GRADE" = "S" ] || [ "$GRADE" = "A" ]; then
    exit 2
  fi
  exit 0
elif awk -v t="$NEW_TOTAL" -v w="$WARN_THRESHOLD" 'BEGIN{exit !(t > w)}'; then
  echo "[COST_GUARD] WARN — 누적 \$${NEW_TOTAL} (예산 80% 도달)" >&2
fi

exit 0
