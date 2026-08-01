---
name: code-review-automation
description: 코드 변경 시 자동 코드 리뷰. '코드 리뷰', 'code review', 'PR 리뷰', '리뷰해줘' 언급 시 사용
---

# Code Review 자동화 스킬

## 목표

**"모든 코드 변경 = 자동 품질 검증"**

코드 변경 시 자동으로 코드 리뷰를 수행하여 품질, 보안, 성능 이슈를 사전에 감지합니다.

---

## 트리거 조건

다음 상황에서 자동 실행:
- "코드 리뷰해줘" 또는 "리뷰해줘" 요청
- "code review" 또는 "PR 리뷰" 요청
- PR 생성 시 자동 실행

---

## 실행 절차

### 1. 변경 사항 수집

다음 정보를 수집:
- 변경된 파일 목록 (`git diff --name-only`)
- 변경 내용 (`git diff`)
- 커밋 메시지
- 변경 유형 (새 기능 / 버그 수정 / 리팩토링)

### 2. 코드 품질 검증

**Code Quality Agent** 기준 적용:
- Method Separation (단일 책임)
- Code Duplication (중복 코드)
- Fail Fast Principle (검증 우선)
- Naming Conventions (네이밍)
- Error Handling (에러 처리)

### 3. 보안 검증

**Security Tester Agent** 기준 적용:
- 입력 검증 (XSS, SQL Injection)
- 인증/인가 처리
- 민감 정보 노출
- OWASP Top 10

### 4. 리뷰 리포트 생성

우선순위별 분류:
- **Critical**: 즉시 수정 필요
- **Warning**: 개선 권장
- **Suggestion**: 선택적 개선

---

## 출력 형식

```
[CODE REVIEW COMPLETE]

Reviewed Files: [개수]

## Critical Issues ([개수])
❌ [이슈 타입] in [File]:[Line]
   Found: [문제 코드]
   Suggestion: [개선 방안]
   Impact: [영향]

## Warnings ([개수])
⚠️ [이슈 타입] in [File]:[Line]
   Found: [문제 코드]
   Suggestion: [개선 방안]

## Suggestions ([개수])
💡 [제안 타입] in [File]:[Line]
   Suggestion: [개선 방안]

## Summary
- **Total Issues:** [개수]
- **Critical:** [개수]
- **Warnings:** [개수]
- **Suggestions:** [개수]
- **Verdict:** [PASS / NEEDS WORK]
```

---

## 금지 사항

- ❌ 코드 자동 수정 (제안만 제공)
- ❌ PR 자동 머지/승인
- ❌ 범위 밖 리팩토링 제안
- ❌ 취향 기반 리뷰 (규칙 기반만)

---

**참고:** AI-SYSTEM의 `agents/12_agent_code_quality.md`와 `playbook/code-review-process.md`를 참고하세요.
