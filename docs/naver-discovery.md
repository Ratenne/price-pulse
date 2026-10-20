# Phase 4.2 — JSON Discovery와 배송비 미확인 비교가격

검토일: 2026-10-21 (Asia/Seoul). 운영 BFF/프록시 검색은 비활성 상태다. 이번 구현은 제공된 JSON의 오프라인 후보 정규화와 별도 검증 후 기존 저장 경로로의 승격이다.

## 원본 분석

분석한 `NomaDamas/k-skill` commit: `50d7bb30f9e2d6b8b09da1055d497fe616820e30`.

- [스킬 지침](https://github.com/NomaDamas/k-skill/blob/50d7bb30f9e2d6b8b09da1055d497fe616820e30/naver-shopping-search/instruction.md)
- [네이버 처리 코드](https://github.com/NomaDamas/k-skill/blob/50d7bb30f9e2d6b8b09da1055d497fe616820e30/packages/k-skill-proxy/src/naver-shopping.js)
- [프록시 라우트·캐시](https://github.com/NomaDamas/k-skill/blob/50d7bb30f9e2d6b8b09da1055d497fe616820e30/packages/k-skill-proxy/src/server.js)
- [원본 테스트](https://github.com/NomaDamas/k-skill/blob/50d7bb30f9e2d6b8b09da1055d497fe616820e30/packages/k-skill-proxy/test/naver-shopping.test.js)
- [스킬 이용 범위 설명](https://github.com/NomaDamas/k-skill/blob/50d7bb30f9e2d6b8b09da1055d497fe616820e30/naver-shopping-search/references/DISCLAIMER.md)

설치된 SKILL.md 및 CLI `instruct` 출력과 원본을 읽었다. 원본 프록시를 실행하거나 네이버 BFF/프록시에 검색을 요청하지 않았다. 스킬은 MIT 표기이나 proxy 패키지는 [AGPL-3.0-only](https://github.com/NomaDamas/k-skill/blob/50d7bb30f9e2d6b8b09da1055d497fe616820e30/packages/k-skill-proxy/package.json)다. 해당 패키지·서버·소스 구현은 복사하거나 의존성으로 추가하지 않았다. 확인한 데이터 계약에 대한 독립적인 제한형 정규화기를 작성했다.

| 확인 항목      | 원본에서 확인한 구조와 PricePulse 판단                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Endpoint       | 프록시 GET `https://k-skill-proxy.nomadamas.org/v1/naver-shopping/search`. BFF GET `https://ns-portal.shopping.naver.com/api/v2/shopping-paged-slot`. 소스에 적힌 경로이며 현재 실호출 지원·공식 허가를 확인한 것은 아님 |
| Request        | 프록시 q/query/keyword, limit(기본10, 최대40), page(기본1), sort. BFF에는 query, source=shp_gui 및 2페이지부터 page 전달. limit/sort는 BFF 요청에 전달하지 않음                                                          |
| Response       | BFF data[].slots[].data. 프록시 items[]·query·meta·upstream·proxy. meta.extraction으로 bff-json/legacy API/HTML 등을 구분                                                                                                |
| ID 종류        | nvMid/catalogId/channelProductId/productId/id 후보. 원본은 우선순위로 product_id 하나를 선택해 ID 체계를 잃을 수 있음. PricePulse는 원래 필드명·각 ID·종류를 보존하며 판매상품 ID로 자동 변환하지 않음                   |
| 상품명·모델    | productNameOrg 등의 이름은 제공. 검증된 제조사·모델·MPN/GTIN·동일성 정보는 확정할 수 없음. 제목으로 모델을 추측하지 않음                                                                                                 |
| 판매처         | mallName 등의 노출 이름은 가능. 판매자 고유 ID는 검증되지 않음. 이름은 identity 근거가 아님                                                                                                                              |
| 표시가격       | 원본은 할인 필드를 우선하고 salePrice 등으로 fallback. 쿠폰가가 포함될 수 있어 일반 구매가격이라고 확정할 수 없음. 원래 가격 필드·값을 후보 증거로 남김                                                                  |
| 배송비         | 확인한 정규화 계약에 일반 배송비가 없음. 후보는 NULL/미확인. 원본에 임의로 추가된 shippingFee=0 플래그도 믿지 않음                                                                                                       |
| 옵션           | 구매 옵션·패키지·보증 등의 확정 정보 없음. 동일성이나 판매 조건이 검증된 것으로 취급하지 않음                                                                                                                            |
| 페이지·정렬    | 선택된 페이지의 카드만 처리. 가격/리뷰 정렬은 페이지 안에서 로컬 적용. date는 미지원. 전체 시장 최저가가 아님                                                                                                            |
| API 종료       | 원본에는 인증정보가 있으면 shop.json을 우선 호출하는 경로가 남아 있음. [네이버 공식 공지](https://developers.naver.com/notice/article/32564)는 2026-07-31 쇼핑 검색 API 종료를 명시. 해당 경로를 도입하지 않음           |
| 접근·활용 권한 | 공개 JSON/정상 프록시 응답은 저장·분석·재표시 허가가 아님. 원본 스킬도 개인 조회 범위를 설명하며 조직적 DB 구축 허가서가 아님. PricePulse 이용 승인은 미확보                                                             |

프록시는 기본 5분 캐시를 사용하며 `proxy.requested_at`도 캐시 응답에서 재사용한다. 이 값과 로컬 수신 시각을 실제 가격 관측 시각으로 바꾸지 않는다. 새 BFF 호스트의 robots URL은 PricePulse 식별자로 1회 조사했고 404 text/html이었다. 이 결과는 접근 허가로 판정하지 않았다. 기존 쇼핑/스토어 호스트의 차단 조사 기록은 [Phase 4 문서](naver-collection.md)를 참조한다.

원본 BFF 전송 코드의 브라우저 User-Agent/Referer와 HTML fallback도 도입하지 않았다. 종료 API·비공식 내부 요청·헤더 위장·프록시 회전·차단 우회는 없다.

## 후보와 관측의 경계

`RetailDiscoveryCandidate`는 source, 외부 ID·종류, 상품명, 표시가격, 판매처, URL·이미지, 카테고리·리뷰 수, 식별 가능 여부, 배송비·확인 여부, 출처·시각·검증 상태를 표현한다. `kind=DISCOVERY`, `validationStatus=UNVERIFIED`이며 `RetailProductInput`과 다르다.

정규화기는 BFF 슬롯과 프록시 bff-json만 처리한다. legacy API·HTML extraction, 구조 오류와 모호한 가격 숫자는 거부하거나 후보 금액을 미확인으로 남긴다. MSRP/reference 금액만 있을 때 표시가격으로 대체하지 않는다. 같은 nvMid라도 판매처/URL이 다르면 별도 후보다. 동일 후보의 충돌 가격도 버리지 않으며 승격 시 보류한다. 결과의 정렬 범위는 항상 PAGE다.

`observedAt`은 캡처 정보가 없으면 NULL이다. `receivedAt`은 수신 시각으로 별도 보존한다. 관측 시각 힌트가 있어도 후보 상태는 미검증이다. 가격/출처/시각 등이 바뀌면 fingerprint가 바뀐다. 상품명이 비슷하다는 이유로 기존 상품을 찾지 않는다.

승격에는 다음 경계가 모두 필요하다.

1. 기존 NAVER 활성화 및 IMPORT 승인: 접근·타 판매자·저장·분석·재표시·환경·사용량 조건을 기존 정책 검사로 강제한다.
2. 정책의 별도 `discovery` 근거와 정확한 dataSources 승인. HTML CRAWL 승인만으로 BFF 자료를 저장하지 않는다.
3. `config/naver-discovery-verifications.json`의 신뢰된 서버 검증. candidateKey+fingerprint, 가격 의미·출처·실제 시각, 판매자 및 판매상품 ID 체계, 완전한 동일성 정보를 확인한다. 기본 파일은 비어 있다.
4. 기존 `upsertRetailProducts`의 동일성 검사와 서버 상품 검토. 가격 승격 검증은 신규 상품 CREATE 승인이 아니다. 신규 상품은 기존 상품 검토 기록이 있어야 한다.

검증 레코드는 원본 카드의 승인 필드에서 만들지 않는다. 관측 시각은 검토 기록에서 증명되어야 하며 now/캐시 시각으로 채우지 않는다. 명시적인 쿠폰 가격은 승격하지 않는다. 배송비 미확인만으로 승격을 탈락시키지 않는다.

미검증 후보는 소스 저장 권한이 있을 때만 기존 `retail_product_review_queue`에 보류 UPSERT한다. 권한 미확인은 큐에도 기록하지 않는다. 성공한 승격은 기존 상품/가격 트랜잭션 안에서 후보 보류를 해결 처리한다. 실패하면 상품·이력·보류 해결도 함께 롤백한다.

검증된 판매상품 키는 ID namespace+sellerId+sellerProductId를 구분한다. 카탈로그 ID 또는 nvMid만으로 listing을 만들지 않는다. 테스트의 ID namespace는 합성 검증 자료이며 실제 네이버 ID 체계를 검증했다는 보고가 아니다. 기존 정확한 상품 동일성 알고리즘은 그대로다.

## 배송비 정책과 DB

| 배송 상태       | 저장                                           | comparisonPrice         | API·화면                               |
| --------------- | ---------------------------------------------- | ----------------------- | -------------------------------------- |
| 확인된 무료배송 | shipping_fee=0                                 | item_price              | 배송비 포함 확정 비교가격              |
| 확인된 유료배송 | shipping_fee>0                                 | item_price+shipping_fee | 배송비 포함 확정 비교가격              |
| 미확인          | shipping_fee=NULL, 검증된 displayed_price 필요 | displayed_price         | 표시가격 기준 비교가격 · 배송비 미확인 |

`011_retail_comparison_prices.sql`을 010 다음에 적용하도록 작성했다. 운영 DB에는 실행하지 않았다.

- 기존 관측/현재가 테이블에 nullable displayed_price를 추가한다. 기존 가격·배송비·관측 시각을 backfill하거나 수정하지 않는다.
- IN_STOCK에서 배송비가 NULL이면 유효 displayed_price를 요구한다. 기존 금액 범위·양수·합계·품절 제약도 유지한다.
- 배송비 확인 여부는 shipping_fee의 NULL 여부로 결정한다. NULL→0을 coalesce하지 않는다.
- 불변 관측 충돌 검사에 displayed_price를 포함한다. NULL→0→양수나 1원 구성 변동은 새로운 시각의 관측으로 보존한다.
- 기존 product_current_prices의 price를 호환 가능한 comparisonPrice로 사용한다. 정렬도 같은 값이다. offers와 현재가 API에 shippingFeeKnown/comparisonBasis 및 원본 금액을 전달한다.
- 소매 우선·다나와 참고가 fallback, 12시간 유효기간, 최신 관측 우선, 품절 제외와 다나와 월별 분석/순위는 유지한다.

카드·목록·상세와 접근성 이름에 비교 기준을 표시했다. 배송비 미확인을 무료배송이나 확정 배송비 포함 가격으로 표현하지 않는다. Discovery 페이지의 로컬 가격순을 시장 전체 최저가로 표시하는 UI는 추가하지 않았다.

## 실행 경로와 배포

```sh
# 파일 정규화만 수행. HTTP/DB 접근 없음. 가격 관측 저장 0건을 명시한다.
pnpm exec tsx server/scripts/refreshRetailPrices.ts --naver-discovery /absolute/path/to/input.json

# 명시적인 승격 경로. 현재 pending 정책에서는 DB 연결 전 skip, 종료 코드 2.
pnpm exec tsx server/scripts/refreshRetailPrices.ts --naver-discovery-import /absolute/path/to/input.json
```

입력은 raw BFF JSON 또는 k-skill proxy bff-json 응답이다. 오프라인 파일 정규화 성공은 실제 수집/가격 저장 성공이 아니다. 원본 파일은 수정하지 않는다. JSON에는 새 서버 검증 기록이나 정책을 전달할 수 없다.

실수집 함수는 `NAVER_BFF_HTTP_DISABLED`로 종료한다. API 키/활성화 플래그/검증 JSON만으로 HTTP 요청을 시작하지 않는다. 기존 소매 workflow의 중단 상태와 모든 판매처 pending 승인을 유지했다. 새 스케줄·서버·프레임워크·의존성·비밀키는 없다.

새 조회 코드가 뷰의 신규 컬럼을 읽으므로 배포 시에는 검토된 환경에서 011을 먼저 적용해야 한다. source 승인과 실제 관측 검증 전에는 운영 import/수집을 활성화하지 않는다. 이 작업에서 운영 SQL·배포·workflow 활성화는 실행하지 않았다.

## 변경 파일과 검증

- 신규: `server/domain/retailDiscovery.ts`, `server/integrations/retail/naverDiscovery.ts`, `server/services/naverDiscoveryImport.ts`, `config/naver-discovery-verifications.json`, `database/011_retail_comparison_prices.sql`.
- 기존 서버: retailPrice/retailPolicy, retailPriceRepository/retailProductRepository, retailProductUpsert, refreshRetailPrices, productPage.
- 공통/API: shared/retailPrices.ts, shared/productPage.ts, client/src/domain/product.ts.
- 표시: productFormatting, ProductCard, ProductList, ProductDetailPage, Dashboard. 새 상품 관리·검색 UI는 만들지 않았다.
- 테스트: JSON/승격/배송비/표시/API/CLI 테스트와 합성 fixture, 기존 SQL 저장·순위 테스트 확장. 패키지·lockfile·승인 JSON·workflow·기존 SQL은 변경하지 않았다.

검증 결과:

- `pnpm check`, `pnpm build`: API 인증정보 없이 통과.
- `pnpm test`: 310개 통과, 별도 DB 설정이 필요한 기존 테스트 5개 건너뜀.
- `database/tests/retailProductUpsert.mts`: PostgreSQL 엔진 검증 28개 통과. 마이그레이션 반복·원본 보존·NULL/0/양수·1원 변동·승격·보류·동일성·신규 검토·판매자 분리·최저가 API·롤백 포함.
- 기존 priceObservationPolicy/rankingPolicy SQL 검증 통과. PGlite 외부 검증 런타임을 재사용했으며 운영 DB에 접속하지 않았다. 단일 세션 WASM 검증은 네이티브 동시 세션 검증을 대체하지 않는다.
- CLI에서 fetch/TCP를 차단해 오프라인 정규화와 미승인 import의 HTTP/DB 접근 0건을 검증했다.
- 실제 BFF·프록시 검색, 실제 가격 수집·계정 인증 성공은 미검증이다. 소스 접근과 저장·분석·재표시 권한 문제가 남아 있다.
