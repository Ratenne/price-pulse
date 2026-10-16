# Changelog

모든 주요 변경 사항은 이 파일에 기록합니다.

## [Unreleased]

### Changed

- 현재가 조회를 요청 시점 다나와 크롤링에서 DB 스냅샷 조회로 변경 (`products.current_price`, `current_price_checked_at`)
- 가격순 정렬·최저가 근접 필터·카테고리 건수를 PostgreSQL에서 처리하고, 목록 총건수는 `count(*) OVER()`로 한 번에 조회
- 요약 쿼리와 목록 쿼리를 병렬 실행, 상세 화면의 이력 쿼리를 상품 쿼리와 병렬 실행
- `/api/products` 응답을 CDN 캐시 대상으로 변경 (`s-maxage=300`, `stale-while-revalidate=3600`)
- 클라이언트의 2단계 현재가 요청(`view=live`) 제거

### Added

- `database/004_live_price_snapshot.sql`: 스냅샷 시각 컬럼과 가격 인덱스
- `server/scripts/refreshLivePrices.ts`, `pnpm refresh:live`: 다나와 목록을 일괄 수집해 스냅샷 갱신
- `.github/workflows/refresh-live-prices.yml`: 3시간 주기 스냅샷 갱신

### Rollout

1. `database/004_live_price_snapshot.sql` 적용
2. `pnpm refresh:live`(또는 Refresh Live Prices workflow) 1회 실행 후 배포
3. 스냅샷이 12시간을 넘으면 현재가는 "확인 불가"로 표시됩니다.

## [1.0.0] - 2026-08-01

### Added

- GPU·CPU·노트북 가격 흐름 데모
- 전체 순위, 카테고리, 상품 상세, 안심거래 화면
- 구매자·판매자 관점 가격 설명
- 인트로, 반응형 UI, 라이트·다크 테마
- AI-Developer-KIT Decision·Architecture·Task 문서
- Vitest 단위 테스트와 GitHub Actions CI
- Vercel 정적 배포 및 수동 Production workflow

### Security

- Vercel 기본 보안 헤더
- GitHub Actions 최소 read 권한
- Production Environment 승인 Gate
- 취약하거나 사용하지 않는 `axios`, `streamdown`, 로컬 `pnpm` 의존성 제거
- Vite, Vitest, Tailwind CSS, PostCSS와 보안 관련 간접 의존성 업데이트
- Production에 불필요한 Manus·JSX 위치 추적 Vite 플러그인 제거

### Known issues

- 화면 가격은 실거래 데이터가 아닌 시연용 데이터입니다.
- 차트 라이브러리 청크가 비교적 크며 후속 성능 측정을 진행합니다.

### Changed

- 페이지 라우트를 lazy loading하여 초기 JavaScript 전송량을 축소
