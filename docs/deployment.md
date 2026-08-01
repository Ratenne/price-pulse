# PricePulse Deployment Runbook

## 대상

- Source: GitHub `Ratenne/price-pulse`
- Hosting: Vercel
- Production branch: `main`
- Static output: `dist/public`
- Production trigger: GitHub Actions 수동 실행

## 사전 조건

1. GitHub 저장소의 `production` Environment를 생성합니다.
2. Environment에 Required reviewer를 지정합니다.
3. 다음 GitHub Actions secrets를 등록합니다.
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
4. Vercel 프로젝트가 GitHub 저장소와 연결되어 있어야 합니다.
5. `CI` workflow가 대상 커밋에서 성공해야 합니다.

## Preview

Vercel Git Integration에서 Pull Request Preview Deployment를 활성화합니다. Preview URL에서 다음 경로를 확인합니다.

- `/`
- `/rankings`
- `/categories?category=GPU`
- `/safe-trade`
- `/products/gpu-rtx-5080`
- `/does-not-exist`

상품 상세 URL을 주소창에서 직접 열고 새로고침하여 SPA rewrite를 검증합니다.

## Production

1. GitHub Actions에서 `Deploy Production`을 선택합니다.
2. `Run workflow`에서 검증된 Git ref를 입력합니다.
3. `production` Environment 승인 요청을 검토합니다.
4. 승인 후 타입 검사와 테스트가 다시 실행됩니다.
5. Vercel prebuilt Production 배포가 실행됩니다.
6. 출력된 Production URL에서 smoke test를 수행합니다.

## 배포 후 점검

- 주요 경로 HTTP 200 또는 의도된 앱 404
- 인트로 영상과 fallback
- GPU·CPU·노트북 카테고리
- 정렬과 페이지네이션
- 상품 상세 가격 차트
- 다크·라이트 테마
- 모바일 375px 및 데스크톱 화면
- 브라우저 콘솔 error 0건
- 시연 데이터 고지 노출

## 실패 처리

- CI 실패: Production 승인 금지
- Preview 실패: `main` 병합 금지
- Production smoke test 실패: `docs/rollback.md` 수행
