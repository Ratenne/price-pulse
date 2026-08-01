# Code Review — 코드 리뷰 전용

이 프로젝트는 **Code Review 단계**다.

---

## 입력 인자

- `INPUT: $ARGUMENTS`
- 권장 호출:
  - `/review`
  - `/review TASK-004`
  - `/review src/api`
- 인자가 있으면 리뷰 범위를 해당 Task/경로 중심으로 제한한다.

## 역할

- 코드 품질 검증
- 코딩 규칙 준수 확인
- 잠재적 버그 및 보안 취약점 감지

---

## 리뷰 프로세스

### Step 1: 변경 사항 파악

```
[REVIEW SCOPE]:
- 변경된 파일: [파일 목록]
- 변경 유형: [새 기능 / 버그 수정 / 리팩토링]
- 영향 범위: [로컬 / 모듈 / 시스템]
```

### Step 2: 코드 품질 검증

**검증 항목:**
1. 코딩 규칙 준수 (`playbook/code-quality-rules.md` 기준)
2. 네이밍 컨벤션
3. 메서드 분리 (단일 책임)
4. 에러 처리
5. 중복 코드

### Step 3: 보안 검증

**검증 항목:**
1. 입력 검증 (XSS, SQL Injection)
2. 인증/인가 처리
3. 민감 정보 노출
4. OWASP Top 10

### Step 4: 성능 검증

**검증 항목:**
1. N+1 쿼리
2. 불필요한 렌더링
3. 메모리 누수 가능성
4. 번들 사이즈 영향

---

## 출력 형식

```
[CODE REVIEW REPORT]

## 요약
- 검토 파일: [개수]
- Critical: [개수]
- Warning: [개수]
- Suggestion: [개수]

## Critical Issues
❌ [이슈 타입] in [File]:[Line]
   Found: [문제 코드]
   Suggestion: [개선 방안]
   Impact: [영향]

## Warnings
⚠️ [이슈 타입] in [File]:[Line]
   Found: [문제 코드]
   Suggestion: [개선 방안]

## Suggestions
💡 [제안 타입] in [File]:[Line]
   Found: [현재 코드]
   Suggestion: [개선 방안]

## 최종 판정
[PASS / NEEDS WORK]

[REASON]: 판정 근거
```

---

## 금지 사항

- ❌ 코드 직접 수정 (제안만 제공)
- ❌ 범위 밖 리팩토링 제안
- ❌ 스타일 취향 강요 (규칙 기반만)

---

## 에스컬레이션

리뷰에서 심각한 문제 발견 시:
1. **Security Tester Agent 호출** — 보안 취약점 심층 분석
2. **Code Quality Agent 호출** — 코드 품질 상세 분석
3. **playbook/code-review-process.md** 참조

---

**참고:** AI-SYSTEM의 `agents/12_agent_code_quality.md`와 `playbook/code-review-routine.md`를 참고하세요.
