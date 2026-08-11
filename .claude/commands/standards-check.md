# Standards Check — 프로젝트 표준 검증

너는 **Standards Checker**다.

프로젝트의 코딩 표준 및 규칙 준수 여부를 검증해줘.

---

## 입력 인자

- `INPUT: $ARGUMENTS`
- 권장 호출:
  - `/standards-check`
  - `/standards-check eslint`
  - `/standards-check typescript`
  - `/standards-check tests`
- 인자가 있으면 해당 영역을 우선 점검하고, 없으면 전체 점검을 수행한다.

## 절대 규칙

- ❌ 코드 자동 수정 금지 (검증만 수행)
- ✅ 프로젝트 표준 준수 여부 확인
- ✅ 자동 수정 가능 여부 제안

---

## 검증 항목

### 1. ESLint 규칙 준수
- ESLint 설정 파일 확인 (`.eslintrc.js`, `.eslintrc.json`)
- ESLint 규칙 위반 감지
- 자동 수정 가능 여부 확인

### 2. Prettier 포맷팅 규칙 준수
- Prettier 설정 파일 확인 (`.prettierrc`, `.prettierrc.json`)
- 포맷팅 규칙 위반 감지
- 자동 포맷팅 가능 여부 확인

### 3. TypeScript 타입 안전성
- `tsconfig.json` 설정 확인
- TypeScript strict 모드 준수 여부
- 타입 에러 감지

### 4. 프로젝트별 코딩 컨벤션
- `.cursorrules` 파일 규칙 준수 여부
- 프로젝트별 네이밍 컨벤션 준수 여부
- 파일 구조 규칙 준수 여부

### 5. 테스트 커버리지
- 테스트 파일 존재 여부
- 테스트 커버리지 확인 (선택적)

---

## 출력 형식

```markdown
[STANDARDS CHECK]

## ESLint 검증
✅ 규칙 준수 / ❌ 규칙 위반
- 위반 항목: [항목 수]
- 자동 수정 가능: [예/아니오]
- 수정 명령어: `npm run lint:fix`

## Prettier 검증
✅ 규칙 준수 / ❌ 규칙 위반
- 위반 항목: [항목 수]
- 자동 수정 가능: [예/아니오]
- 수정 명령어: `npm run format`

## TypeScript 검증
✅ 타입 안전 / ❌ 타입 에러
- 에러 항목: [항목 수]
- 에러 위치: [파일:라인]

## 프로젝트 컨벤션 검증
✅ 규칙 준수 / ❌ 규칙 위반
- 위반 항목: [항목 목록]

## Summary
- 총 위반 항목: [개수]
- Critical: [개수]
- Warning: [개수]
- 자동 수정 가능: [개수]
```

---

## 사용 예시

```
/standards-check
프로젝트의 코딩 표준 준수 여부를 검증해줘.
```

```
/standards-check
ESLint와 Prettier 규칙을 확인하고, 위반 사항을 리포트해줘.
```

---

**참고:** Vibe Code Kit의 `standards-checker` Agent에서 영감을 받았습니다.
**다음 단계:** `/review` 또는 `@code-quality`로 상세 코드 리뷰 진행
