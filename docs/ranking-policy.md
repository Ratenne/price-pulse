# 가격 이력 및 순위 정책 v1.0 — 2단계

2026-10-20 요청과 이 대화에서 사용자가 확정한 답변을 기준으로 구현했다.
1단계 가격 수집·저장 구조와 009 테이블을 재사용한다. 이번 작업에 추가 DB 마이그레이션은 없다.

## 확정한 기준

| 항목           | 기준                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 메인 이름      | `6개월 가격 변동폭 TOP 10`                                                                                                              |
| 6개월 자격     | 최근 완료된 6개 월 모두에 유효한 월별 이력이 있거나, 실제 최초~최종 관측 간 KST 달력 6개월 이상 경과                                    |
| 관측 최소 조건 | 분석에 사용할 서로 다른 유효 가격 시점 2개 이상. 같은 가격을 반복 확인한 시점도 포함                                                    |
| 별도 순위      | 6개월 자격 미충족 상품. 기존 페이지당 10개를 재사용하며 전체 후보를 페이지로 제공                                                       |
| 정렬           | 기존 코드 그대로 변동률 내림차순 → 변동액 내림차순 → 서버에서 상품 ID                                                                   |
| 이력 혼합      | 6개 월별 이력이 완비되면 기존 월별 계산 유지. 나머지는 같은 기간 시작~현재의 실제 데이터를 사용하되 월별 이력이 있는 월의 실관측은 제외 |

6개월은 180일로 대체하지 않는다. 실관측의 KST 시각에 PostgreSQL 달력 `interval '6 months'`를 더해 최종 관측 시각과 비교한다.
월말은 달력의 마지막 날짜로 조정된다. 예: 8월 31일 → 다음해 2월 28일/29일.
월별 레코드는 해당 월의 가격으로 취급하며 월의 1일을 실제 관측일로 간주하지 않는다.
6개 월 조건은 가장 오래된/최근 월의 차이만으로 인정하지 않는다. 제외된 월·누락된 월이 있으면 해당 조건을 충족하지 않는다.

## 변경 전후

| 구분              | 변경 전                               | 변경 후                                                      |
| ----------------- | ------------------------------------- | ------------------------------------------------------------ |
| 후보              | 최근 6개월 안에 월별 값이 있으면 포함 | 6개월 자격과 유효 시점 최소 조건을 별도로 검사               |
| 실관측            | 분석에서 미사용                       | 009의 이벤트·성공 확인 기록·실제 재관측 시각 재사용          |
| 한 가격 반복 확인 | 월별 이력 중심으로만 판단             | 하나의 이벤트라도 여러 실제 확인 시점이면 여러 관측으로 인정 |
| 0~1개 가격        | 조회 제외 또는 변동폭 0으로 계산 가능 | 상품 정보/현재가는 유지, 분석값은 `null`, 순위에서 제외      |
| 짧은 이력         | 6개월 순위와 혼합                     | 별도 순위, 확보된 월 범위와 실관측 KST 시각 표시             |
| 제외 가격         | 품질 검토 뷰에서 제외                 | 같은 뷰를 유지하고 순위 자격·개수에서도 제외                 |

## 데이터 경로와 계산

`/api/products` → `parseProductQuery` → `readProductPage` → 기존 `pg` Pool을 사용한다.
브라우저는 외부 가격 수집이나 관리자 DB 변경을 하지 않는다.

- 월별 값: `price_histories_for_analysis`, 기존 최근 완료된 6개월 범위를 유지.
- 실관측: `price_observations`와 `price_collection_status`의 CURRENT/NORMAL 확인을 연결한다.
  이벤트 최초 시각과 `last_observed_at` 역시 실제 기록으로 사용하고, `UNION`으로 같은 시점·같은 가격을 중복 제거한다.
- 실제 시각이 분석 기준 시각보다 미래이면 제외한다.
- 6개 월별 값이 모두 있으면 관측 이벤트가 추가되어도 기존 최저·최고·평균·변동폭을 바꾸지 않는다.
- 나머지 상품은 월별 값이 없는 월의 실제 관측만 보완한다. 최초 관측 이전 가격을 만들지 않는다.
- 최저·최고·평균 및 적정 범위는 분석용 시점이 2개 이상일 때만 계산한다.
- 변동액 = 최고가 − 최저가. 변동률 = 변동액 ÷ 최저가 × 100. 같은 가격의 두 관측은 유효한 0원/0%다.
- 과거 월별 데이터와 일관되게 **다나와 기본가**를 분석한다. 별도 판매처의 배송비 포함 현재 가격은 기존대로 표시하며 순위 이력에 섞지 않는다.
- 전체 관측 기간은 6개월 자격 판정에 사용한다. 화면의 확보 기간은 해당 변동폭에 실제 사용한 월별 범위와 실관측 범위를 표시한다.
  API의 `coverageFirstObservedAt`/`coverageLastObservedAt`은 전체 관측 범위이며 `firstObservedAt`/`lastObservedAt`은 분석에 사용한 실관측 범위다.

단순히 최초 관측 이후 시간이 6개월 지났다는 이유로 자격을 주지 않는다. **실제 최종 관측**까지의 기간이 기준이다.
별도 순위는 “최근 6개월 전체 가격 변동”으로 표시하지 않고 `관측 기간 변동폭`으로 구분한다.
6개 월 중 일부가 비어 있는 상품은 확보 월 수와 월 범위를 함께 표시한다.

## API와 상품 보존

- `view=home`: 6개월 자격과 최소 관측 조건을 충족한 상위 10개.
- `view=rankings&period=six-months`: 6개월 순위, 페이지당 10개.
- `view=rankings&period=under-six-months`: 별도 순위, 페이지당 10개.
- `view=rankings&period=all`: 전체 상품 탐색. 분석 불가 상품도 유지하며 순번을 순위로 표시하지 않는다.
- 기존 현재가 정렬 URL은 기간을 명시하지 않으면 전체 상품을 조회한다. 순위 기본 URL은 6개월 후보를 조회한다.
- 카테고리 전체 목록과 상세 조회는 이력 없는 상품도 반환한다. 카테고리 순위 미리보기는 별도 6개월 후보 쿼리를 재사용한다.
- 기존 상품 수는 전체 목록을 기준으로 집계한다. 분석 불가 값은 평균 계산에서 NULL로 제외하고, 전부 분석 불가면 평균도 NULL이다.
- `analysis`는 유효 분석 시점 수, 월별 개수, 실제 기간, 순위 구분, 데이터 상태를 담는다.
- 월별 `priceHistory`는 유지하며, 상세/대표 상품의 실제 시각 이력은 `observedPriceHistory`로 구분한다.

기존 현재가 뷰, 12시간 유효기간, 배송비 포함 판매처 가격 표시, 기존 품질 검토/원본 이력 보존은 유지한다.
현재가만 있다고 분석 가능한 것으로 취급하지 않는다. 현재가를 재확인해도 부족한 과거 분석값을 0으로 채우지 않는다.

## 상태 표시

1단계의 `NORMAL`, `INSUFFICIENT_HISTORY`, `NO_SOURCE_DATA`, `COLLECTION_FAILED`를 분석 메타데이터에서 구분한다.
수집 실패와 확인된 원본 데이터 부재는 합치지 않는다. 분석 가능 여부는 기존 유효 기록으로 별도 판단한다.
수집 오류가 있어도 기존 유효 이력은 사용 가능하며 상품 정보나 현재가를 삭제하지 않는다.

사용자 노출은 이번 요청에서 확정한 **데이터 부족**으로 제한했다. 내부 오류 코드·원문 이유를 화면에 노출하지 않는다.
이력이 0~1개면 가격 위치 막대·적정 범위·변동폭을 생성하지 않는다. 현재 가격과 상품명·상세 링크는 유지한다.
로딩/조회 오류는 기존 `ProductLoadState`로 처리하며, 로딩 중을 데이터 부족으로 표시하지 않는다.

## 검증

기존 설치된 도구를 직접 실행한다. 새 dependency를 추가하지 않았다.

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/vite/bin/vite.js build
node node_modules/esbuild/bin/esbuild server/index.ts server/scripts/backfillDanawa.ts server/scripts/bulkBackfillDanawa.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
node --import tsx database/tests/rankingPolicy.mts
node --import tsx database/tests/priceObservationPolicy.mts
```

격리 SQL 검증은 기존 별도 PGlite 설치를 사용한다. 프로젝트 밖에 설치했으면
`PRICEPULSE_PGLITE_MODULE`에 해당 `dist/index.js`의 file URL을 지정한다.
DB 비밀번호나 네트워크를 사용하지 않는다.

검증 항목:

2026-10-20 실행 결과: TypeScript 검사 통과, Vite/esbuild 빌드 통과, Vitest 126개 통과·운영 DB 테스트 5개 skip.
격리 PostgreSQL 순위 검증과 1단계 관측 정책 회귀 검증도 모두 통과했다.

- 기존 정렬 순서와 6개 월별 이력 수치 회귀.
- 6개월 정확한 경계, 1밀리초 전, KST 월말·윤년, 미래 관측 제외.
- 관측 0개/1개/같은 가격 2개, 이벤트 1개·정상 확인 2개.
- 월별·실관측 중복 집계 방지, 제외 가격 보존, 전체 상품/현재가 유지.
- 별도 순위 페이지당 10개 및 다음 페이지를 통한 전체 후보 제공.
- UI 서버 렌더링: 데이터 부족 문구, 현재가 유지, 0원/0% 미생성, 추정 가격 막대 미생성, 메인 제목 유지, 짧은 이력 혼입 방지, 실제 기간 표시.
- 1단계 격리 DB 검증과 기존 단위 테스트 회귀.

운영 DB 연결을 요구하는 기존 5개 테스트는 기본 실행에서 skip한다. 이번 작업에서 운영 DB 변경이나 실제 재수집은 실행하지 않는다.
새 API 쿼리는 이미 적용한 009가 필요하며, 기존 현재가 표시를 위해 기존 008의 뷰도 필요하다.

## 이번 단계 수정 파일

- `server/services/productPage.ts`, `productPage.test.ts`, `priceQuality.integration.test.ts`
- `client/src/domain/product.ts`
- `shared/productPage.ts`, `priceAnalysis.ts`, `priceAnalysis.test.ts`, `priceChart.ts`, `priceChart.test.ts`
- `client/src/services/productService.ts`, `client/src/lib/productFormatting.ts`
- `client/src/components/PriceRangeRanking.tsx`, `ProductList.tsx`, `ProductCard.tsx`, `PriceRangeBar.tsx`, `PriceHistoryChart.tsx`, `priceDataState.test.ts`
- `client/src/pages/Dashboard.tsx`, `RankingsPage.tsx`, `CategoriesPage.tsx`, `ProductDetailPage.tsx`
- `vitest.config.ts`, `database/tests/rankingPolicy.mts`
- `PRODUCT.md`, `docs/ranking-policy.md`

요청에서 미확정이었던 기간 기준·표시 개수·혼합 데이터 범위는 이번 대화에서 확정했다.
정렬 기준은 기존 구현에서 확인한 기준을 보존했다. 연속 관측 요구, 자동 순위 보정, 새로운 추천 기준은 추가하지 않았다.
