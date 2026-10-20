# 가격 이력 정책 v1.0 / 누락 예외 정책 v1.2(A안) 구현

요구사항 기준은 이번 작업에 제공된 PRODUCT 정책이다. 운영 DB 접속, 마이그레이션 적용, 실제 상품 재수집은 수행하지 않았다.

## 분석과 최소 변경

기존 `price_histories`는 `(product_id, source, price_year_month, granularity)` 유일 제약,
`MONTH` / `HISTORICAL_IMPORT` 체크 제약을 가진다. 같은 달 여러 변동, 배송비,
실제 관측 시각을 담을 수 없다. 이 제약과 월별 조회 뷰를 변경하지 않고 별도 관측 테이블을 추가했다.
DB 접근은 기존 `pg` Pool과 상품별 트랜잭션을 사용한다. 별도 서버, 스케줄러, 런타임 의존성은 추가하지 않았다.

- 현재 가격: `DanawaProductListClient` → `fetchLivePrices` / `readSelectedLivePrices` → `refreshLivePriceSnapshot` → `PgLivePriceSnapshotRepository`.
- 과거 가격: `DanawaPriceHistoryClient` → parser → historical collector → bulk/weekly/single backfill → `PgPriceHistoryRepository`.
- 원격 main 통합 시점의 주기: 현재가·월별 이력·상품 탐색 모두 3시간마다 매시 07분. 원격에서 변경된 스케줄을 유지한다.
- 기존 현재가 경로는 다나와 목록의 기본가만 반환한다. 배송비는 **미제공(NULL)** 이며 0원으로 대체하지 않는다.
- 작업 전 존재하던 외부 판매처 수집 코드와 `008_retail_prices.sql`은 이번 변경 대상이 아니다. 해당 경로는 기본가·배송비가 확인된 판매처별 관측을 기존 테이블에 저장한다.

## DB 변경과 기존 데이터 영향

`database/009_price_observation_policy.sql`을 **001~004 이후** 적용한다.
005의 `pc_*` 설계를 활성화하지 않으며 006~008에 의존하지 않는다. 기존 API가 008의 뷰를 필요로 하는 점은 기존 작업과 같다.

| 객체                             | 용도                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `price_observations`             | 실제 최초 관측/기준 관측/가격 변경. 기본가·배송비·시각, 같은 가격을 확인한 마지막 시각과 횟수 |
| `price_collection_status`        | 상품·출처·CURRENT/HISTORY·확인 시각별 수집 결과. 성공/실패를 시도별 보존                      |
| `latest_price_collection_status` | 각 상품·수집 경로의 최신 확인 결과                                                            |
| `products_without_price_history` | 검토 제외되지 않은 유효 월별 이력과 실관측 이력이 모두 0건인 상품·외부 코드 매핑              |

새 테이블에는 RLS를 활성화하고 테이블/뷰의 PUBLIC·anon·authenticated 권한을 회수한다.
기존과 같이 서버의 DB 소유자 권한 연결로 실행한다. 별도 최소 권한 수집 계정을 쓰는 환경에서는
운영자가 그 계정의 필요한 SELECT/INSERT/UPDATE 권한과 RLS 접근을 확인해야 한다.

마이그레이션은 상품·기존 월별 가격·현재가·기존 시각을 갱신하지 않는다.
현재가를 복사하거나 상품 등록일/월 첫날을 관측 시각으로 설정하는 SQL이 없다.
기존 월별 이력은 수집 작업에서 덮어쓰지 않는다. 출처가 다른 값으로 다시 응답해도 기존 행을 유지하고 skipped로 집계한다.
가격 정정이 필요하면 기존 품질 검토 절차를 통해 별도로 판단해야 한다.

## 실제 수집 및 저장 흐름

1. 외부 상품 코드를 기존 매핑으로 내부 ID에 연결한다. 누락 복구는 gap 뷰의 상품만 조회하며 외부 코드를 중복 처리하지 않는다.
2. 기존 다나와 목록/상품명 검색을 다시 요청한다. 목록 응답을 읽은 시점에 `observedAt`을 붙인다. 상품명 검색은 정확히 같은 외부 코드만 인정한다.
3. 양의 안전한 정수 기본가가 실제로 확인된 경우에만 저장한다. 다나와 배송비는 미제공 상태로 남긴다. 저장 경로는 확인된 배송비가 전달되는 경우 0원 이상 안전한 정수로 검증한다.
4. 상품별 트랜잭션에서 탐색과 같은 외부 코드 advisory lock을 먼저 얻고, 매핑을 잠근 다음 월별 백필과 같은 내부 상품 advisory lock을 얻는다. 탐색과 동시 실행 시 잠금 순서 충돌을 피한다. 마지막 관측보다 오래된 결과는 무시한다. 동일 시각·다른 가격은 `OBSERVATION_CONFLICT`로 실패시킨다.
5. 유효 이력이 0건이면 `FIRST_OBSERVATION`을 생성한다. 기존 월별 이력이 있으면 현재 가격의 `OBSERVATION_BASELINE`을 남겨 이후 변동을 비교한다. 월별 값과 현재값을 같은 시점의 값으로 비교하지 않는다.
6. 기본가 또는 **양쪽 모두 확인된 배송비**가 1원 이상 달라지면 `PRICE_CHANGE`를 생성한다. 합계가 같아도 개별 금액이 달라지면 기록한다.
7. 가격이 같으면 기존 이벤트의 `last_observed_at`·`observation_count`만 갱신한다. 별도로 성공 확인 결과도 남긴다. 배송비의 확인 가능 여부가 바뀌면 `OBSERVATION_BASELINE`을 남기며 숫자 변동으로 단정하지 않는다.
8. 이력·현재가·성공 상태를 같은 트랜잭션으로 반영한다. 실패하면 상품 단위로 롤백한다. 이미 성공한 상품은 유지되므로 부분 실패 후 재실행할 수 있다.

최초 관측 유일 인덱스와 관측 시각 PK가 중복 생성을 방지한다. 같은 관측의 재전달은 횟수를 늘리지 않는다.
이벤트의 최초 가격·관측 시각은 수정하지 않는다. 동일 가격의 후속 확인 메타데이터만 누적한다.
성공 확인 시각 목록과 실패 시도 목록을 보존하므로, 첫 확인~마지막 확인 사이가 계속 정상 관측되었다고 추정할 필요가 없다.

상품 탐색은 그 실행에서 새로 받은 목록 가격을 관측값으로 저장한다. 과거 이력 요청이 실패하거나 과거 데이터가 없어도
이미 확인된 현재 가격의 관측은 보존된다. `products.current_price`는 복구 입력으로 사용하지 않는다.
상품 등록/메타데이터 갱신은 기존 현재가를 덮어쓰지 않는다. 성공한 관측 저장 경로가 현재가와 확인 시각을 함께 갱신한다.

## 상태 및 실패 집계

CURRENT와 HISTORY 결과를 분리한다. 현재 가격 확인 성공이 과거 이력 수집 실패를 지우지 않는다.

| 상태                   | 판단                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `NORMAL`               | 해당 수집 경로에서 가격 확인 성공. HISTORY에서는 유효한 완료 월을 확보한 경우                    |
| `INSUFFICIENT_HISTORY` | 정상 응답이지만 당월 월별 가격만 제공되어 완료 월 가격이 없는 경우                               |
| `NO_SOURCE_DATA`       | 24/12/6개월 구간 모두 명시적 빈 응답. count=0과 result 미제공 또는 빈 배열 등 일관된 구조        |
| `COLLECTION_FAILED`    | HTTP/네트워크/잘못된 JSON/알 수 없는 구조/모순된 count·result/일부 파싱 오류/현재 가격 확인 불가 |

`NORMAL`은 해당 수집 성공을 뜻하며 순위 자격이나 충분한 관측 기간을 뜻하지 않는다.
현재 관측만 있고 완료 월별 이력이 없는 상품의 상태는 관측 성공과 HISTORY 상태/gap 정보로 구분한다.
아직 역사적 수집을 시도하지 않은 상품은 HISTORY 결과 행이 없으며, 이를 출처 데이터 없음으로 확정하지 않는다.

2026-10-20에 [다나와 공식 화면 스크립트](https://prod.danawa.com/info/js/common.min.js?v=2610081500)를 읽기 전용으로 확인했다.
화면은 count가 양수이면 result를 사용하고, 그렇지 않으면 가격 추이가 없음을 표시한다.
따라서 count=0인 일관된 월별 구간을 데이터 부재로 인정하되, 양수 count에서 result가 없는 응답은 오류로 유지한다.
모든 필드가 누락된 `{}`, 오류 envelope, result=null, 양수 집계값이 있는데 빈 결과인 응답은 데이터 부재로 확정하지 않는다.
제공된 27개 상품의 실제 원문 응답은 저장소에 없어 일괄 재분류하지 않았다.

실제 오류는 기존 오류 단계(VALIDATION/HTTP/PARSE 등)와 함께 기록한다.
일부 행이 잘못되었지만 유효 행도 있으면 유효한 완료 월은 저장하고, 전체 확인 결과는 실패로 보고한다.
현재 목록에서 상품이나 유효 가격이 빠진 사실만으로 상품 삭제·현재가 NULL 처리·확인 시각 갱신을 하지 않는다.

명령 종료 기준:

- 0: 확인 완료. 원본 데이터 없음, 당월만 존재, 대상 없음도 포함.
- 2: 상품/페이지 일부 수집 오류 또는 현재가 확인 실패. 정상 데이터는 유지.
- 1: DB 오류, 전체 요청 실패 등 실행 중단.

기존 워크플로우는 비영 종료 코드를 실패로 처리하므로 별도 Actions 변경은 필요 없다.
주간 스크립트는 일부 오류도 종료 코드 2로 보고한다. bulk의 목표 행 수 미달 자체는 오류가 아니며 `targetReached`로 별도 보고한다.
확인된 데이터 부재 때문에 전체 수집이 실패하지 않는다.

## 운영 적용

1. 현재 DB의 001~004 적용 여부와 기존 제약조건/서버 권한을 확인하고, 009를 검토 후 적용한다.
2. 코드 배포 전 새 뷰·테이블 접근을 확인한다. 운영 DB 검증/적용은 이 작업에서 실행하지 않았다.
3. 대상 목록을 읽기 전용으로 확인한다.

```sql
SELECT * FROM products_without_price_history ORDER BY product_id;
SELECT * FROM latest_price_collection_status ORDER BY product_id,stream;
```

4. 운영 승인을 받은 뒤 필요한 경우 기존 명령으로 누락 상품만 재확인한다.

```sh
pnpm exec tsx server/scripts/refreshLivePrices.ts --missing-history
```

`DB_URL` 등 기존 환경 변수를 사용한다. 과거 이력을 확보하는 명령은 기존 `refresh:danawa`,
`backfill:danawa`, `backfill:danawa:bulk`를 유지한다. 현재가 정기 실행은 `refresh:live`다.
누락 복구는 현재가를 직접 다시 확인하므로 이력이 없는 상품의 과거 가격을 합성하지 않는다.
현재 GPU 수집 범위와 24→12→6개월 선택 순서는 그대로다. 새로 등록한 상품은 다음 현재가 실행/탐색 또는 누락 복구에서 관측된다.
롤백 시 이전 코드의 현재가 삭제/월별 덮어쓰기 동작도 복원될 수 있으므로 수집 배치를 먼저 중지하고 검토한다. 신규 이력 테이블을 삭제할 필요는 없다.

## 검증

다음은 2026-10-20 로컬 실행 기준이다.

- `tsc --noEmit`: 통과.
- Vite 프런트엔드 + esbuild 서버/백필 빌드: 통과.
- Vitest: 112개 통과. 운영 DB 기반 기존 5개 테스트는 명시적 opt-in이 없어 skip.
- `database/tests/priceObservationPolicy.mts`: 별도 설치되어 있던 PGlite(실제 PostgreSQL 엔진의 WASM 빌드)를 사용한 격리 검증 통과.
  마이그레이션 반복/권한/기존 행 보존/누락 탐지/최초 관측/배송비/같은 달 변동/동일 관측/오래된 결과/트랜잭션 롤백/부분 실패/주간·bulk 회귀를 검사한다.
- 격리 엔진은 단일 연결이므로 실제 운영 PostgreSQL에서 다중 세션 advisory lock 대기까지 검증한 것은 아니다. 코드에서는 기존 월별 백필과 같은 잠금 키를 사용한다.
- `pnpm check`는 로컬 pnpm 실행기의 자동 설치·심볼릭 링크 권한 문제로 실행되지 않아 동일한 설치된 도구를 Node로 직접 호출했다. 의존성 재설치/변경은 하지 않았다.

직접 검증 명령:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/vite/bin/vite.js build
node node_modules/esbuild/bin/esbuild server/index.ts server/scripts/backfillDanawa.ts server/scripts/bulkBackfillDanawa.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
node --import tsx database/tests/priceObservationPolicy.mts
```

마지막 명령은 테스트 전용 PGlite가 별도 설치된 환경에서 실행한다. 설치 위치가 프로젝트 밖이면
`PRICEPULSE_PGLITE_MODULE` 환경 변수에 해당 `dist/index.js`의 file URL을 지정한다.
이 스크립트는 DB 환경 변수를 읽거나 네트워크를 사용하지 않는다. 런타임/lockfile에 의존성을 추가하지 않았다.

## 미확정 정책 및 확인 한계

- 충분한 이력의 기간/연속성/순위 포함 기준: 추가하지 않음. 수집 결과와 실제 성공 확인 시각을 제공한다.
- 과거 가격 확인 범위: 기존 범위를 유지. 새로운 탐색 기간/추정 가격은 추가하지 않음.
- 다나와 현재가의 배송비: 현재 수집기가 제공하지 않으므로 미확인으로 보존. 다나와 배송비 변경을 실제로 감지하려면 검증 가능한 배송비 출처가 필요하다. 저장 계층의 배송비 단독 1원 변동은 격리 DB에서 검증했다.
- 35개 상품의 운영 데이터 건수와 실제 복구 결과, 운영 스키마의 드리프트 여부는 운영 DB에서 별도 확인해야 한다.
- 수집 상태/관측의 보존 기간이나 자동 정리 정책은 새로 정하지 않았다.

## 이번 작업 수정 파일

기존 작업에서 이미 수정되어 있던 프런트엔드/판매처 수집 파일은 이번 변경에 포함하지 않는다.

| 구분         | 파일                                                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB/격리 검증 | `database/009_price_observation_policy.sql`, `database/tests/priceObservationPolicy.mts`                                                                                                                                                                                                                                  |
| 도메인       | `server/domain/discoveredProduct.ts`, `historicalPrice.ts`, `priceCollection.ts`, `priceCollection.test.ts`                                                                                                                                                                                                               |
| 다나와 연동  | `server/integrations/danawa/danawaProductListClient.ts`, `danawaLivePrices.ts`, `danawaLivePrices.test.ts`, `danawaPriceHistoryParser.ts`, `danawaPriceHistoryParser.test.ts`                                                                                                                                             |
| 저장 계층    | `server/repositories/livePriceSnapshotRepository.ts`, `livePriceSnapshotRepository.test.ts`, `priceHistoryRepository.ts`, `priceHistoryRepository.test.ts`, `priceCollectionStatus.ts`, `productRepository.ts`                                                                                                            |
| 서비스       | `server/services/livePriceSnapshot.ts`, `livePriceSnapshot.test.ts`, `weeklyPriceRefresh.ts`, `weeklyPriceRefresh.test.ts`, `danawaBulkBackfillService.ts`, `danawaBulkBackfillService.test.ts`, `historicalPriceBackfillService.ts`, `historicalPriceBackfillService.test.ts`, `createHistoricalPriceBackfillService.ts` |
| 명령         | `server/scripts/refreshLivePrices.ts`, `refreshDanawa.ts`, `bulkBackfillDanawa.ts`, `backfillDanawa.ts`                                                                                                                                                                                                                   |
| 문서         | `docs/price-history-policy.md`, `docs/danawa-collection.md`                                                                                                                                                                                                                                                               |
