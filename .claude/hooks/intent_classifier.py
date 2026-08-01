#!/usr/bin/env python3
"""
intent_classifier.py — 콜드 스타트 진입점 라우터 (UserPromptSubmit hook)

문제: 컨텍스트 0인 사용자가 "뭐해야해?" / "어디서 시작?" 하면 매칭이 없어 침묵한다.
      모르는 사람에게 필요한 첫 단계는 '리서치(landscape)'인데 자동 진입점이 없었다.
해결: 콜드 스타트 발화를 감지해 리서치 → 검증 → 배포 파이프라인 진입을 stderr로 강제 안내.

- 입력: UserPromptSubmit JSON {"prompt": "..."}
- 동작: 콜드 스타트 패턴 감지 → 다음 액션 stderr 안내 (차단 X)
- 라우팅 대상은 모두 이 키트에 포함된 자산: researcher 에이전트 · validation/decision 스킬 · idea-to-deploy 스킬
"""
import json
import re
import sys

COLD_START_PATTERNS = [
    # 컨텍스트 0인 사람 진입 — 모르면 리서치(landscape)부터가 정답. 되묻기 금지.
    r"뭐\s*(해야|하지|부터|하면)",
    r"뭐\s*를?\s*해",
    r"어디(서|부터)\s*(시작|해)",
    r"어떻게\s*시작",
    r"처음\s*(인데|이야|이에요|입니다|이라)",
    r"막막",
    r"감\s*(이|도)\s*안",
    r"what\s*(should|do|can)\s*i\s*do",
    r"where\s*(do|should)\s*i\s*start",
    r"how\s*do\s*i\s*start",
]


def is_cold_start(prompt: str) -> bool:
    return any(re.search(p, prompt, re.IGNORECASE) for p in COLD_START_PATTERNS)


def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            sys.exit(0)
        prompt = (json.loads(raw) or {}).get("prompt", "")
    except Exception:
        sys.exit(0)

    if not prompt or not is_cold_start(prompt):
        sys.exit(0)

    print("\n[INTENT_DETECTED]: COLD_START", file=sys.stderr)
    print("  → 콜드 스타트(컨텍스트 0): 묻지 말고 리서치부터 — 되묻기 금지, 바로 실행", file=sys.stderr)
    print("     1. researcher 에이전트 → 시장·경쟁·landscape 스캔", file=sys.stderr)
    print("     2. 방향 좁혀지면 → validation 스킬(가설검증) → decision(GO/HOLD/KILL)", file=sys.stderr)
    print("     3. GO면 → idea-to-deploy 스킬(Phase 0~8 파이프라인)", file=sys.stderr)
    print("     ⚠️ '뭐 할까요?' 되묻기 금지 — 모르는 사람에겐 landscape부터 돌린다", file=sys.stderr)
    sys.exit(0)


if __name__ == "__main__":
    main()
