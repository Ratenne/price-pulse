# 07. Architecture — PricePulse 배포 아키텍처

## 핵심 전제

- 현재 데이터는 번들에 포함된 로컬 mock 데이터입니다.
- 런타임 API, 데이터베이스, 서버 세션이 필요하지 않습니다.
- Express 서버는 일반 Node 호스팅 대안이며 Vercel 배포에서는 정적 산출물만 사용합니다.
- Production은 CI 성공과 수동 승인 뒤 배포합니다.

## 전체 플로우

```text
Developer
  → GitHub main / Pull Request
  → GitHub Actions: install → typecheck → unit test → build
  → Vercel Preview Deployment
  → 주요 경로 검증 및 승인
  → Vercel Production Deployment
  → URL·콘솔·모바일 smoke test
  → 모니터링 또는 즉시 rollback
```

## 애플리케이션 데이터 플로우

```text
mockProducts.ts
  → productService.ts
  → AppContext / Pages
  → ProductCard / Chart / Range UI
  → 브라우저 정적 화면
```

## 컴포넌트 책임

| 컴포넌트 | 책임 |
|---|---|
| `client/src/domain` | 상품과 카테고리 타입 |
| `client/src/data` | 시연 상품과 가격 이력 생성 |
| `client/src/services` | 조회, 정렬, 요약 경계 |
| `client/src/pages` | 라우트 단위 화면 구성 |
| `client/src/components` | 가격·상품 UI 표현 |
| GitHub Actions | 재현 가능한 타입·테스트·빌드 Gate |
| Vercel | 정적 자산, HTTPS, Preview, Production, rollback |

## 빌드 계약

- Node.js: 24
- pnpm: `packageManager`에 선언된 10.34.4
- 설치: `corepack pnpm install --frozen-lockfile`
- 검사: `corepack pnpm run check`
- 테스트: `corepack pnpm run test`
- 빌드: `corepack pnpm run build`
- 정적 출력: `dist/public`

## 라우팅 계약

정적 파일이 아닌 요청은 `/index.html`로 rewrite하여 Wouter가 처리합니다. `/products/:id` 직접 접근과 새로고침이 반드시 동작해야 합니다.

## 보안 경계

- 프로덕션 시크릿과 API 키가 없습니다.
- `.env*`는 Git에서 제외합니다.
- 보안 헤더는 Vercel 설정에서 적용합니다.
- 외부 상품 이미지 대신 내부 정적 SVG를 사용합니다.

## 실패와 대응

| 실패 | 대응 |
|---|---|
| CI 실패 | 배포 후보 차단, 로그 기반 수정 |
| Preview 화면 오류 | Production 승격 금지 |
| SPA 직접 접근 404 | rewrite 설정 점검 |
| Production 치명 오류 | 직전 Vercel 배포로 rollback |
| 정적 자산 실패 | `dist/public` 및 경로 검증 후 재배포 |

## MVP 포함·제외

- 포함: 정적 UI, mock 데이터, CI, Preview/Production 배포
- 제외: API, DB, 인증, 결제, 실시간 가격 수집

**생성일:** 2026-08-01
