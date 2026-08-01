# PricePulse Task List

> 2026-08-01 현재 코드베이스를 기준으로 역산한 완료 작업 목록입니다.
> 상태는 구현 파일과 TypeScript·프로덕션 빌드 검증 결과를 근거로 기록합니다.

## 현재 상태

- 구현 형태: 프론트엔드 중심 데모 애플리케이션
- 데이터 형태: 28개 로컬 시연 상품 데이터
- 검증: TypeScript 검사 통과, Vite 프로덕션 빌드 통과
- 미포함: 실시간 가격 수집, 사용자 계정, 결제, 실거래, 영속 DB

## 완료된 Task

### TASK-01: 애플리케이션 셸과 페이지 라우팅

- **Description:** 공통 앱 셸과 주요 서비스 페이지 및 404 라우팅을 구현했습니다.
- **Status:** ✅ 완료
- **Completed Files:**
  - `client/src/App.tsx`
  - `client/src/components/Header.tsx`
  - `client/src/components/SiteFooter.tsx`
  - `client/src/pages/NotFound.tsx`
- **Completed Criteria:**
  - [x] 홈, 전체 순위, 카테고리, 안심거래, 상품 상세 경로 제공
  - [x] 존재하지 않는 경로의 404 화면 처리
  - [x] 공통 헤더와 푸터 적용

### TASK-02: PricePulse 홈 대시보드

- **Description:** 가격 흐름의 핵심 가치와 주요 상품 신호를 한 화면에 구성했습니다.
- **Status:** ✅ 완료
- **Completed Files:**
  - `client/src/pages/Dashboard.tsx`
  - `client/src/components/HeroSection.tsx`
  - `client/src/components/CategoryShortcuts.tsx`
  - `client/src/components/PriceRangeRanking.tsx`
- **Completed Criteria:**
  - [x] 대표 상품 가격 차트 표시
  - [x] 카테고리 바로가기 제공
  - [x] 6개월 가격 변동폭 TOP 10 표시
  - [x] 최근 최저가 근접 상품과 카테고리 요약 표시

### TASK-03: 상품 도메인과 시연 데이터

- **Description:** 상품, 가격 이력, 가격 상태와 적정 거래 범위 모델을 구성했습니다.
- **Status:** ✅ 완료
- **Completed Files:**
  - `client/src/domain/product.ts`
  - `client/src/domain/category.ts`
  - `client/src/data/mockProducts.ts`
  - `client/src/services/productService.ts`
- **Completed Criteria:**
  - [x] GPU·CPU·노트북 카테고리 모델 정의
  - [x] 28개 시연 상품 데이터 제공
  - [x] 변동폭, 최저가 근접도, 가격 위치 계산값 제공
  - [x] 조회, 정렬, 카테고리 요약 서비스 제공

### TASK-04: 전체 순위와 필터·정렬·페이지네이션

- **Description:** 전체 상품을 카테고리와 가격 기준으로 탐색하는 순위 화면을 구현했습니다.
- **Status:** ✅ 완료
- **Completed Files:**
  - `client/src/pages/RankingsPage.tsx`
  - `client/src/components/ProductCard.tsx`
  - `client/src/lib/pagination.ts`
- **Completed Criteria:**
  - [x] 카테고리 필터 제공
  - [x] 변동폭, 가격 오름차순·내림차순, 최저가 근접 순 정렬
  - [x] URL 쿼리와 화면 상태 동기화
  - [x] 페이지네이션과 순위 번호 표시

### TASK-05: 카테고리별 탐색

- **Description:** GPU·CPU·노트북별 요약과 상품 목록을 제공하는 화면을 구현했습니다.
- **Status:** ✅ 완료
- **Completed Files:**
  - `client/src/pages/CategoriesPage.tsx`
  - `client/src/components/CategoryShortcuts.tsx`
- **Completed Criteria:**
  - [x] URL 쿼리를 통한 초기 카테고리 선택
  - [x] 카테고리별 상품 수와 가격 요약 표시
  - [x] 전체 카테고리 상품 카드 표시

### TASK-06: 상품 상세 가격 분석

- **Description:** 상품별 가격 이력, 현재 위치, 적정 범위와 거래 관점을 구현했습니다.
- **Status:** ✅ 완료
- **Completed Files:**
  - `client/src/pages/ProductDetailPage.tsx`
  - `client/src/components/PriceHistoryChart.tsx`
  - `client/src/components/PriceRangeBar.tsx`
  - `client/src/lib/productFormatting.ts`
- **Completed Criteria:**
  - [x] 6개월 가격 이력 차트 제공
  - [x] 최저·최고·평균·적정 가격 범위 제공
  - [x] 구매자와 판매자 관점의 판단 메시지 제공
  - [x] 유사 가격대 관련 상품 추천

### TASK-07: 안심거래 설명 화면

- **Description:** PricePulse가 가격을 판단하는 기준과 양측 가치를 설명하는 화면을 구현했습니다.
- **Status:** ✅ 완료
- **Completed Files:**
  - `client/src/pages/SafeTradePage.tsx`
- **Completed Criteria:**
  - [x] 구매자·판매자 관점 분리 설명
  - [x] 현재 가격 위치, 적정 범위, 최근 방향 기준 안내
  - [x] 시연 데이터 한계 고지

### TASK-08: 인트로·테마·반응형 사용자 경험

- **Description:** 브랜드 인트로와 테마 전환, 오류 보호 및 반응형 화면을 구현했습니다.
- **Status:** ✅ 완료
- **Completed Files:**
  - `client/src/components/intro/IntroVideo.tsx`
  - `client/src/components/intro/IntroLayers.tsx`
  - `client/src/contexts/AppContext.tsx`
  - `client/src/contexts/ThemeContext.tsx`
  - `client/src/components/ErrorBoundary.tsx`
  - `client/src/index.css`
- **Completed Criteria:**
  - [x] 세션 단위 인트로 노출과 건너뛰기 제공
  - [x] 인트로 로드 실패 대체 화면 제공
  - [x] 라이트·다크 테마 전환 제공
  - [x] 모바일·데스크톱 반응형 레이아웃 적용
  - [x] 렌더링 오류 경계 제공

### TASK-09: 프로덕션 빌드와 정적 서버

- **Description:** 클라이언트 번들과 SPA 정적 제공 서버 구성을 완료했습니다.
- **Status:** ✅ 완료
- **Completed Files:**
  - `vite.config.ts`
  - `server/index.ts`
  - `package.json`
  - `tsconfig.json`
- **Completed Criteria:**
  - [x] Vite 프로덕션 번들 생성
  - [x] Express 정적 파일 제공
  - [x] SPA fallback 라우팅 제공
  - [x] TypeScript strict 검사 통과

## 후속 정리 후보

아래 항목은 현재 구현 완료로 판정하지 않았으며, 별도 Scope 결정 후 Task로 전환합니다.

- 실시간 가격 수집원 및 업데이트 파이프라인
- 영속 데이터베이스와 백엔드 API
- 상품 검색과 사용자 관심 목록
- 자동화된 단위·통합·E2E 테스트
- CI/CD 및 배포 환경 구성
- 메인 번들 코드 분할과 성능 최적화

## 배포 준비 Task

### TASK-10: KIT Gate 문서와 배포 범위 잠금

- **Status:** ✅ 완료
- **Criteria:**
  - [x] `docs/00_context.md`부터 `docs/08_risks.md` 작성
  - [x] `decision-lock.md` GO 판정과 배포 범위 고정
  - [x] Vercel 정적 배포 아키텍처 정의

### TASK-11: 자동 테스트 구성

- **Status:** ✅ 완료
- **Criteria:**
  - [x] 가격 서비스·포맷·페이지네이션 단위 테스트
  - [x] `pnpm run test` 스크립트
  - [x] 타입 검사·테스트 통과

### TASK-12: GitHub Actions CI Gate

- **Status:** ✅ 완료
- **Depends On:** TASK-11
- **Criteria:**
  - [x] Node와 pnpm 버전 고정
  - [x] frozen lockfile 설치
  - [x] 타입 검사·테스트·빌드 자동 실행

### TASK-13: Vercel Preview·Production 설정

- **Status:** ✅ 설정 완료 / 외부 연결 대기
- **Depends On:** TASK-12
- **Criteria:**
  - [x] `dist/public` 정적 배포 설정
  - [x] SPA rewrite와 보안 헤더
  - [x] Preview 검증 후 Production 수동 승인 workflow

### TASK-14: 배포 감사와 운영 인계

- **Status:** 🟡 로컬 검증 완료 / 외부 배포 대기
- **Depends On:** TASK-13
- **Criteria:**
  - [x] 보안·성능·출시 감사
  - [x] 로컬 Production smoke test
  - [x] rollback 절차 문서화
  - [ ] Preview·Production 배포 후 smoke test
