# Docs MVP — 문서 생성 전용

이 프로젝트는 **문서 생성 단계**다.

---

## 역할

- 신규 사업 문서 자동 생성
- `templates/project_docs/` 템플릿 사용
- MVP 범위 제한

---

## 생성할 문서

다음 문서를 `docs/` 디렉토리에 생성:

1. **`00_context.md`** - 왜 이걸 만드는가
2. **`01_market.md`** - 시장 문제 구조
3. **`02_user.md`** - 핵심 사용자 1~2명
4. **`03_journey.md`** - 현재 → 문제 → 이상적 상태
5. **`04_solution.md`** - 우리가 제안하는 해법
6. **`05_scope.md`** - 하지 않을 것
7. **`06_mvp.md`** - 1차 MVP 정의
8. **`07_metrics.md`** - 성공 기준
9. **`08_risks.md`** - 리스크 & 대응

---

## 사용 방법

1. **템플릿 복사**
   ```bash
   cp -r ai-system/templates/project_docs/* docs/
   ```

2. **각 파일 채우기**
   - Decision 단계에서 결정한 내용 기반
   - 각 템플릿의 가이드라인 따르기

3. **MVP 범위 확인**
   - `05_scope.md` 확인
   - `06_mvp.md` 범위 확인

---

## 금지 사항

- ❌ 기술 중심 설명
- ❌ 완성도 추구
- ❌ 범위 확장

---

**참고:** AI-SYSTEM의 `prompts/04_docs_mvp.md`를 참고하세요.
