# Changelog

모든 주요 변경 사항은 이 파일에 기록합니다.

## [Unreleased]

### Documentation (2026-10-19)

- 루트 README·제품 명세·AI 컨텍스트를 PostgreSQL 상품 API와 다나와 수집 배치의 현재 구현에 맞게 갱신
- 초기 Decision Lock의 정적 데모 결정은 역사 기록으로 보존하고 현재 확장 범위를 별도로 명시
- `template.json`의 정적 전용 설명과 내장 예시 파일을 현재 소스 스냅샷으로 동기화 (전체 앱을 재생성하는 독립 템플릿은 아님)
- `components.json`, `package.json`, TypeScript·Vercel JSON 설정은 실제 경로·스크립트·워크플로우와 대조하고 기존 설정 유지

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
- 다나와 GPU 상품 탐색·월별 가격 이력 백필과 매주 월요일 06:17(KST) 이력 갱신 workflow
- 화면별 상품 API 조회, DB 검색·페이지네이션과 로딩·오류·재시도 처리
- `database/003_reviewed_price_exclusions.sql`: 원본을 보존하는 검토 제외 기록·뷰와 차트 제외 월 표시
- `database/005_price_collection.sql`: 현재 API·배치와 분리된 `pc_*` 확장 수집 스키마
- `database/006_review_g210_september_price.sql`: G210 2026년 9월 특정 가격의 추가 검토 제외

### Rollout

1. 기본 스키마 `001`·`002`와 가격 검토 뷰 `003`의 적용을 확인하고 `database/004_live_price_snapshot.sql` 적용
2. `pnpm refresh:live`(또는 Refresh Live Prices workflow) 1회 실행 후 배포
3. 스냅샷이 12시간을 넘으면 현재가는 "확인 불가"로 표시됩니다.
4. G210 검토 제외는 `006`을 별도로 적용하고 확인합니다. SQL 저장이나 웹 배포만으로 DB에 적용되지는 않습니다. `005`는 현재 API의 필수 스키마가 아닙니다.

### Known issues

- 일부 화면의 현재가 안내 문구에는 이전 요청 시 조회 방식이 남아 있어 DB 스냅샷 구현과 다릅니다.
- GPU 외 카테고리의 데이터 유무, 수집 workflow 성공, 운영 DB SQL 적용 상태는 별도 확인이 필요합니다.

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

- 1.0.0 배포 당시 화면 가격은 실거래 데이터가 아닌 시연용 데이터였습니다. 현재 데이터 경로는 위 Unreleased 항목을 확인합니다.
- 차트 라이브러리 청크가 비교적 크며 후속 성능 측정을 진행합니다.

### Changed

- 페이지 라우트를 lazy loading하여 초기 JavaScript 전송량을 축소
