# Workflow Rules: 커밋 정책 (SSOT)

> 상세 브랜치 전략 및 커밋 형식 정본: `playbook/06-git-collaboration/git-workflow.md`
> 여기서는 AI 에이전트가 커밋 실행 전 반드시 적용하는 핵심 원칙만 유지한다.

---

## WHEN

- `@git-helper` 에이전트가 커밋 명령을 실행하기 전
- "커밋해", "커밋하고 배포해", "변경사항 저장해" 요청이 왔을 때
- `release-ops-bridge` 스킬 실행 전

---

## 커밋 전 필수 체크 (순서 고정)

```
[COMMIT GATE]
1. 보안 검증   → .env / API Key / Secret 포함 여부
2. 범위 검증   → node_modules / dist / build / .next 포함 여부
3. 형식 검증   → 커밋 메시지 TYPE + 내용 일치 여부
4. Task 연결   → 커밋 메시지에 Task ID 또는 맥락 포함 여부
```

하나라도 실패하면 커밋을 중단하고 `[COMMIT HOLD]` 출력 후 이유를 명시한다.

---

## 커밋 메시지 형식

**기본 형식:**
```
[TYPE]: 간단한 설명

- 변경 내용 1
- 변경 내용 2

Related: TASK-XX (있는 경우)
```

**Task 기반 프로젝트 형식:**
```
[TYPE] TASK-XX: 간단한 설명

- 변경 내용 1
- 변경 내용 2
```

**TYPE 목록:**

| TYPE | 사용 시점 |
|------|---------|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `refactor` | 기능 변경 없는 코드 재구성 |
| `test` | 테스트 추가/수정 |
| `chore` | 빌드, 설정, 의존성 변경 |
| `style` | 포맷팅 (기능 변경 없음) |
| `perf` | 성능 개선 |
| `merge` | 브랜치 머지 |
| `ci` | CI/CD 파이프라인 변경 |

---

## 금지 규칙 (절대)

- ❌ `.env`, `.env.local`, `.env.production` 커밋
- ❌ API Key, SECRET, TOKEN 하드코딩된 파일 커밋
- ❌ `node_modules/`, `.next/`, `dist/`, `build/` 커밋
- ❌ 대용량 파일(.db, .csv, dump, 10MB+) 커밋
- ❌ `main` 브랜치에 직접 커밋 (hotfix 제외)
- ❌ `--force` push (절대 금지)
- ❌ 의미 없는 메시지: "수정", "update", "fix", "작업완료"

---

## 브랜치 전략 요약

```
main              ← 프로덕션. 직접 커밋 금지
  └── develop     ← 통합 브랜치
      ├── feature/TASK-XX-description
      ├── fix/TASK-XX-description
      └── hotfix/description  → main + develop 양쪽 머지
```

---

## 출력 형식 (git-helper 실행 시)

```
[COMMIT GATE]
보안: PASS / FAIL
범위: PASS / FAIL
형식: PASS / FAIL
Task 연결: PASS / N/A

[COMMIT MESSAGE]
git add [파일 목록]
git commit -m "[TYPE]: [설명]

- [변경 내용]

Related: [TASK-XX]"
```

---

## 참고

- 상세 브랜치 전략: `playbook/06-git-collaboration/git-workflow.md`
- 보안 규칙: `.claude/rules/core/security.md`
- 자동 실행: `release-ops-bridge` Skill ("커밋하고 배포해" 트리거)
