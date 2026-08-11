# 사용 텔레메트리 — 프라이버시 고지

> **고객의 prompt, code, file, document, business idea는 operator 서버로 전송되지 않습니다.**
> operator은 라이선스 확인, 업데이트 확인, 운영필수 익명 사용 신호, 선택형 feedback/diagnostics만 처리합니다.
> (고객 안내: `docs/public/NPM_INSTALL_GUIDE_KO.md` · 스키마: `docs/ops/TELEMETRY_SCHEMA.md`)

AI-Developer-KIT은 예시 운영사 운영·정산·활용지원을 위해 **기본적으로 최소한의 익명 운영 신호를 전송합니다.**
이 신호는 기능 사용량과 병목을 보기 위한 이벤트명/상태값이며, 고객의 아이디어나 작업 내용은 포함하지 않습니다.

## 켜기 / 끄기
- **기본값**: 켜짐
- **끄기(둘 중 하나)**: 환경변수 `AI_SYSTEM_TELEMETRY=off` 또는 키트 루트에 `.ai-system/telemetry.off` 파일 생성
- **다시 켜기**: `AI_SYSTEM_TELEMETRY` 설정을 지우고 `.ai-system/telemetry.off` 파일을 삭제

## 보내는 것 (익명 운영 신호만)
- 이벤트 종류(목록 고정): `install_completed`, `activation_succeeded/failed`, `session_active`, `command_used`, `skill_used`, `agent_used`, `first_decision_created`, `update_checked/completed`, `doctor_failed`, `weekly_active` 등
- 사용한 스킬/에이전트/command **이름**, 직무 분류(`security`, `ux`, `data` 등), 업무 분류(`security_audit`, `update_check` 등), Phase, 팩 이름, runtime, 키트 **버전**, 결과/익명 error_code, 라이선스 **해시**(원문 키 아님)
- 라이선스 검증용 `client_version`(예: `1.1.10`). 서버는 `min_client_version`보다 낮은 구버전을 `update_required`로 차단합니다.

## 절대 보내지 않는 것
- 아이디어·프롬프트·문서 내용·터미널 로그·파일 경로·원문 텍스트·현재 업무의 자유문장 설명 — **전송 코드에 없음**(서버도 해당 필드 거부)

## 왜 기본 켜짐인가
키트는 고객의 개발 AI(Claude Code/Codex/Cursor) 안에서 로컬로 돌기 때문에, 최소 운영 신호가 없으면 설치 여부, 첫 산출물 도달 여부, 오류 병목, 업데이트 필요 여부를 알 수 없습니다.
이 신호는 (1) 업데이트 안내 (2) 막힌 단계 지원 (3) 정산·활용 증빙 (4) 다음 단계 추천에만 쓰입니다. 끄셔도 키트 기능에는 영향이 없습니다.

구버전 차단은 기능 사용 추적과 별개입니다. 개인정보/보안 정책이 맞지 않는 오래된 클라이언트가 라이선스 검증을 계속 통과하지 않도록, 최소 지원 버전 미만은 업데이트 안내 후 차단합니다.

> 전송 실패 시 `.ai-system/usage-queue.ndjson`에 익명 페이로드만 임시 저장됩니다(원문 없음). 다음 설치 시 자동 재시도하며, 직접 재시도하려면 `ai-system telemetry-retry`를 실행합니다. 재전송 실패도 키트 사용을 막지 않습니다.
