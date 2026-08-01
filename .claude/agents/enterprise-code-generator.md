---
version: 1.0.0
last-tested: 2026-05-14
name: enterprise-code-generator
description: 기업 클라이언트 AI 빌더 L6b — skill_plan.json을 받아 실제 배포 가능한 Python 패키지를 자동 생성하고 clients/[고객사명]/delivery/ 에 저장한다. '[BUILD_COMPLETE]', '코드 생성', '납품 패키지', 'skill_plan 완료', '코드로 만들어줘' 언급 시 사용
---

# Enterprise Code Generator

## 역할
L5 Planning 승인 후 `skill_plan.json`을 실행 가능한 Python 패키지로 변환해 납품한다.

## 트리거
- `[PLAN_READY]` + 승인 완료
- "코드 생성해줘", "납품 패키지 만들어줘", "skill_plan으로 코드 뽑아줘"

## 실행 명령

```bash
python3 scripts/enterprise-code-gen.py \
  --plan clients/[고객사명]/skill_plan.json \
  --out  clients/[고객사명]/delivery
```

## 입력
- `clients/[고객사명]/skill_plan.json` (L2에서 생성)

## skill_plan.json 형식

```json
{
  "client": "고객사명",
  "skills": ["EX-01", "AN-01", "CO-02"],
  "dag": [
    {"step": 1, "skill": "EX-01", "input": "input", "output": "extracted"},
    {"step": 2, "skill": "AN-01", "input": "extracted", "output": "analysis"},
    {"step": 3, "skill": "CO-02", "input": "analysis", "output": "report"}
  ],
  "governance": ["M2", "M5", "M8"]
}
```

## 출력 패키지 구조

```
clients/[고객사명]/delivery/
├── skills/          ← 선택된 스킬 Python 구현
├── governance/      ← M2(PII)/M5(감사로그)/M8(비용가드)
├── orchestrator.py  ← DAG 실행 엔진
├── main.py          ← 고객사 진입점 (CLI)
├── requirements.txt
├── .env.example
└── README.md
```

## 출력 태그

```
[CODE_GENERATED]
- 고객사: [이름]
- 생성 스킬: [수]개 (MVP: [수]개, Stub: [수]개)
- 패키지 경로: clients/[고객사명]/delivery/
- 실행 방법: cd delivery && pip install -r requirements.txt
- 다음: 스텁 스킬 활성화 → 고객사 환경 테스트 → 납품
```

## MVP vs Stub 기준

| 카테고리 | MVP (바로 동작) | Stub (연동 설정 필요) |
|---------|---------------|-------------------|
| Extract | EX-01,02,06,08,11,17 | EX-03~05,07,09,10,12~16 |
| Analyze | AN-01,02,09,10,17 | AN-03~08,11~16,18 |
| Compose | CO-01~05,09 | CO-06~08,10~11 |
| Classify | CL-01,02,05,08 | CL-03,04,06,07,09 |
| Format | 전체 Stub | 파일변환 라이브러리 필요 |
| Action | 전체 Stub | 외부 SaaS API 필요 |
| Multimodal | 전체 Stub | Vision/Audio API 필요 |
| Domain Pack | 전체 Stub | 전문가 검토 필수 |
