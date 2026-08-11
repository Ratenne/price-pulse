#!/usr/bin/env bash
# usage-emit.sh — privacy-safe 운영 텔레메트리 emit (키트가 고객 개발 AI 안에서 실행).
# 기본 ON. 운영/정산/활용지원에 필요한 최소 이벤트만 전송하며, 사용자는 언제든 opt-out 가능하다.
# 내용/프롬프트/아이디어/파일명/경로/코드/로그 원문은 절대 보내지 않는다.
# 사용: usage-emit.sh <event> [skill] [key=value ...]
#   허용 key: command, pack, runtime, result, error_code, output_type,
#             agent_id, phase_id, job_role, task_kind, workflow_stage,
#             tool_family, error_stage
#   자유문장/업무내용은 금지. 위 key는 정해진 분류 토큰만 보낸다.
#   예) usage-emit.sh command_used "" command=decision runtime=claude_code result=success
set -euo pipefail
EVENT="${1:-}"; shift || true
[ -z "$EVENT" ] && exit 0
SKILL=""
# 2번째 인자가 key=value 형태가 아니면 skill로 취급(하위호환)
if [ "${1:-}" ] && [[ "${1:-}" != *=* ]]; then SKILL="$1"; shift || true; fi

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

# 운영필수 텔레메트리는 기본 ON.
# 끄기: AI_SYSTEM_TELEMETRY=off|0|false|no 또는 .ai-system/telemetry.off 파일 생성.
# 이전 버전의 .ai-system/telemetry.on 파일은 하위호환용으로만 허용한다.
CONSENT="${AI_SYSTEM_TELEMETRY:-on}"
[ -f "$ROOT/.ai-system/telemetry.off" ] && CONSENT="off"
case "$(printf '%s' "$CONSENT" | tr '[:upper:]' '[:lower:]')" in
  off|0|false|no) exit 0 ;;
esac

ENDPOINT="${AI_SYSTEM_TRACKING_ENDPOINT:-https://ai-kit.Operator OS.io/api/usage}"
LIC="${AI_SYSTEM_LICENSE_HASH:-}"
[ -z "$LIC" ] && [ -f "$ROOT/.ai-system/license-hash" ] && LIC="$(cat "$ROOT/.ai-system/license-hash" 2>/dev/null || true)"
LIC="${LIC:-anon}"
VER="$(grep '"version"' "$ROOT/package.json" 2>/dev/null | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo '')"

# 값 정화 함수 — 허용 토큰만
san() { printf '%s' "${1:-}" | tr -cd 'A-Za-z0-9_.:-' | cut -c1-"${2:-80}"; }

# 익명 설치 ID — 로컬 1회 생성(신원과 무관, 코호트 D1/D7/D30 계산용)
IID=""
IDFILE="$ROOT/.ai-system/install-id"
[ -f "$IDFILE" ] && IID="$(cat "$IDFILE" 2>/dev/null || true)"
if [ -z "$IID" ]; then
  RAND="$(head -c16 /dev/urandom 2>/dev/null | od -An -tx1 2>/dev/null | tr -d ' \n' | cut -c1-24)"
  [ -z "$RAND" ] && RAND="$(date +%s)$$"
  IID="ins_${RAND}"
  mkdir -p "$ROOT/.ai-system" 2>/dev/null || true
  printf '%s' "$IID" > "$IDFILE" 2>/dev/null || true
fi
IID="$(san "$IID" 40)"

EVENT="$(san "$EVENT" 40)"
SKILL="$(san "$SKILL" 80)"

# 추가 필드(허용 키만) 파싱
COMMAND=""; PACK=""; RUNTIME=""; RESULT=""; ERROR_CODE=""; OUTPUT_TYPE=""
AGENT_ID=""; PHASE_ID=""; JOB_ROLE=""; TASK_KIND=""; WORKFLOW_STAGE=""
TOOL_FAMILY=""; ERROR_STAGE=""
for kv in "$@"; do
  case "$kv" in
    command=*)    COMMAND="$(san "${kv#command=}" 80)" ;;
    pack=*)       PACK="$(san "${kv#pack=}" 40)" ;;
    runtime=*)    RUNTIME="$(san "${kv#runtime=}" 40)" ;;
    result=*)     RESULT="$(san "${kv#result=}" 20)" ;;
    error_code=*) ERROR_CODE="$(san "${kv#error_code=}" 40)" ;;
    output_type=*) OUTPUT_TYPE="$(san "${kv#output_type=}" 40)" ;;
    agent_id=*) AGENT_ID="$(san "${kv#agent_id=}" 80)" ;;
    phase_id=*) PHASE_ID="$(san "${kv#phase_id=}" 20)" ;;
    job_role=*) JOB_ROLE="$(san "${kv#job_role=}" 40)" ;;
    task_kind=*) TASK_KIND="$(san "${kv#task_kind=}" 40)" ;;
    workflow_stage=*) WORKFLOW_STAGE="$(san "${kv#workflow_stage=}" 40)" ;;
    tool_family=*) TOOL_FAMILY="$(san "${kv#tool_family=}" 40)" ;;
    error_stage=*) ERROR_STAGE="$(san "${kv#error_stage=}" 40)" ;;
  esac
done

PAYLOAD="{\"event\":\"${EVENT}\",\"skill\":\"${SKILL}\",\"agent_id\":\"${AGENT_ID}\",\"phase_id\":\"${PHASE_ID}\",\"job_role\":\"${JOB_ROLE}\",\"task_kind\":\"${TASK_KIND}\",\"workflow_stage\":\"${WORKFLOW_STAGE}\",\"tool_family\":\"${TOOL_FAMILY}\",\"error_stage\":\"${ERROR_STAGE}\",\"command\":\"${COMMAND}\",\"pack\":\"${PACK}\",\"runtime\":\"${RUNTIME}\",\"result\":\"${RESULT}\",\"error_code\":\"${ERROR_CODE}\",\"output_type\":\"${OUTPUT_TYPE}\",\"anonymous_install_id\":\"${IID}\",\"license_hash\":\"${LIC}\",\"version\":\"${VER}\"}"

if command -v curl >/dev/null 2>&1; then
  curl -fsS -m 4 -X POST "$ENDPOINT" -H 'Content-Type: application/json' -d "$PAYLOAD" >/dev/null 2>&1 && exit 0
fi
# 전송 실패/네트워크 없음 → 로컬 큐(다음 기회에 replay)
mkdir -p "$ROOT/.ai-system" 2>/dev/null || true
printf '%s\n' "$PAYLOAD" >> "$ROOT/.ai-system/usage-queue.ndjson" 2>/dev/null || true
exit 0
