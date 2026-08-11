# PR Review — Pull Request 리뷰 전용

이 프로젝트는 **PR Review 단계**다.

---

## 입력 인자

- `INPUT: $ARGUMENTS`
- 권장 호출:
  - `/pr-review`
  - `/pr-review main`
  - `/pr-review origin/main`
- 인자가 있으면 base branch로 사용하고, 없으면 기본 base를 자동 추정한다.

## 역할

- PR 변경 사항 전체 리뷰
- 커밋 이력 기반 변경 흐름 분석
- 머지 가능 여부 판정

---

## 리뷰 프로세스

### Step 1: PR 개요 파악

```
[PR OVERVIEW]:
- PR 제목: [제목]
- 브랜치: [source] → [target]
- 커밋 수: [개수]
- 변경 파일: [개수]
- 변경 라인: +[추가] / -[삭제]
```

### Step 2: 커밋 이력 분석

```bash
# 변경 사항 확인
git log --oneline [base]..HEAD
git diff [base]...HEAD --stat
```

**확인 사항:**
1. 커밋 메시지 품질 (의미 있는 단위인가)
2. 커밋 순서 논리성
3. 불필요한 커밋 포함 여부

### Step 3: 코드 변경 리뷰

**파일별 검토:**
1. 변경 목적과 실제 변경 일치 여부
2. 코딩 규칙 준수
3. 테스트 코드 포함 여부
4. 문서 업데이트 여부

### Step 4: 통합 검증

**확인 사항:**
1. 기존 기능 영향도
2. API 계약 변경 여부
3. 마이그레이션 필요 여부
4. 환경 변수 변경 여부

---

## 출력 형식

```
[PR REVIEW REPORT]

## PR 개요
- Title: [PR 제목]
- Branch: [source] → [target]
- Files Changed: [개수]
- Lines: +[추가] / -[삭제]

## 변경 요약
[1-3줄 요약]

## 코드 리뷰 결과

### Critical Issues
❌ [이슈] in [File]:[Line]
   [설명 및 제안]

### Warnings
⚠️ [이슈] in [File]:[Line]
   [설명 및 제안]

### Suggestions
💡 [제안] in [File]:[Line]
   [설명]

## 체크리스트
- [ ] 코딩 규칙 준수
- [ ] 테스트 코드 포함
- [ ] 문서 업데이트
- [ ] 기존 기능 영향 없음
- [ ] API 계약 유지

## 최종 판정
[APPROVE / REQUEST CHANGES / COMMENT]

[REASON]: 판정 근거
```

---

## 금지 사항

- ❌ 코드 직접 수정 (제안만 제공)
- ❌ PR 자동 머지
- ❌ 범위 밖 변경 요청
- ❌ 취향 기반 리뷰 (규칙 기반만)

---

**참고:** AI-SYSTEM의 `agents/12_agent_code_quality.md`와 `playbook/code-review-process.md`를 참고하세요.
