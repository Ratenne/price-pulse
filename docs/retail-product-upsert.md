# Phase 2: 상품 동일성 검사와 소매 가격 UPSERT

## 구현 전 스키마 검토

| Current Schema                                                          | Required Change                                                                                 | Reason                                                                | Data Impact                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| products는 id/name/category 필수. 제조사·MPN·변형의 검증된 구조가 없다. | retail_product_identities에 검증된 구조와 고유 identity_key/MPN·GTIN+정확한 옵션 범위 제약 추가 | 이름 유사도 없이 동일성 비교, 동시 신규 등록 방지                     | 기존 상품과 다나와 정보는 덮어쓰거나 역추정하지 않는다.                     |
| product_source_mappings는 DANAWA 전용이고 상품당 source 1개 제약        | 기존 제약 유지. retail_product_links에 외부 상품 ID와 source별 고유 인덱스 추가                 | 같은 판매처의 여러 판매상품을 같은 기존 상품에 연결                   | 기존 연결은 외부 ID를 자동 추정하지 않고 NULL로 유지한다. 검토 후 연결한다. |
| 소매 관측과 최신가는 재고 있음·금액 필수 상태만 표현                    | 두 테이블에 availability 추가, 품절일 때만 금액 NULL 허용. 관측에 API 방식·출처 추가            | 품절도 실제 시각을 가진 관측으로 보존하고 오래된 재고로 복원하지 않음 | 기존 행은 IN_STOCK으로 유지. 기존 금액·관측 시각 변경 없음.                 |
| 보류 대상 저장소 없음                                                   | source/외부 ID별 단일 retail_product_review_queue 추가                                          | 재수집 중복 방지, 최초 확인 시각·후보·사유 추적                       | 미검증 입력은 상품·가격 테이블에 쓰지 않음.                                 |
| product_current_prices는 현재가 뷰, DANAWA는 배송비 미확인 참고가       | 동일 뷰에서 명시적 품절 제외                                                                    | 승인 판매처의 최신 상품가+배송비 우선순위 유지                        | products.current_price와 월별 price_histories는 수정하지 않음.              |

기존 005의 pc\_\*를 활성화하거나 다른 정책 시스템과 혼합하지 않는다. 009의 price_observations/price_collection_status는 계속 DANAWA 전용이다. 소매 관측은 008의 기존 테이블을 재사용한다.

## Migration 계획

기존 001→002→003→004→008→009 적용 상태에서 `010_retail_product_identity.sql`을 적용한다. 005는 필요하지 않다. 운영 적용은 이 작업에서 수행하지 않는다. 010은 트랜잭션 안에서 재실행 가능하도록 작성하고, 기존 데이터와 공개 역할 권한이 유지되는지 격리 DB에서 검증한다.

## Rollback 계획

신규 입력 배치를 중지하고 이전 서버 코드로 되돌린다. 010의 추가 테이블·칼럼과 품절 필터 뷰는 유지하여 이미 저장한 신규 상품·API 관측·보류 기록을 보존한다. 새 관측에 NULL 금액/품절/API 방식이 있을 수 있으므로 예전 NOT NULL·method 제약을 무조건 복구하거나 008 뷰를 재적용하면 안 된다. 물리적 스키마 축소가 필요하면 해당 데이터의 별도 보존·호환성 검토 후 별도 마이그레이션을 작성한다.

## 식별과 검토 기준

판매처 입력의 manufacturer/model/variants/distributor/warranty는 모두 실제 제공값이어야 한다. 필수 옵션은 빈 값이나 누락을 허용하지 않고, 카테고리별 필수 키는 검토자가 확인한 식별 기록과 비교한다. 기존 소매 대상 GPU는 `memory`, `overclock`, `bundle` 키를 필수로 사용한다. CPU·LAPTOP은 검토자가 해당 모델의 필수 옵션 키를 선언해야 한다. 정규화 어댑터는 실제 제공값만 이 키로 옮기며 누락을 기본 옵션으로 추정하면 안 된다. MPN/GTIN은 제공되는 경우 비교한다. 같은 식별자와 옵션·유통사·보증 범위에서 모델 표기만 달라지면 신규 INSERT 대신 충돌 보류한다. DB 고유 인덱스도 이를 보호한다. 정규화는 NFKC·대소문자·연속 공백만 다루며 구두점이나 숫자를 제거하지 않는다.

서버 전용 `config/retail-product-reviews.json`은 기본 빈 배열이다. 검토자가 기존 productId와 MATCH하거나, 검증한 상품명·명시적 카테고리로 CREATE를 승인한다. 공급자 입력 자체에 승인 플래그를 넣어 신규 등록을 허용하지 않는다. 기존 미검증 카탈로그 후보가 있으면 자동 신규 등록을 보류한다. 기존 신뢰할 식별정보가 없는 다나와 상품을 상품명에서 역추정하지 않는다.

신규 ID는 danawa-와 구분되는 retail- 접두사와 검증된 식별 키의 해시를 사용한다. 판매처 ID 잠금·상품 식별 키 잠금과 고유 제약으로 동시 중복 등록을 막고 상품 하나 단위로 commit/rollback한다.

검증된 동일성만 있어도 외부 상품명 변경은 허용하되 기존 products.name은 변경하지 않는다. GPU의 모델·메모리·OC, 유통사·보증·구성품 차이는 정확한 변형 값으로 구분한다. 검토자가 선언한 필수 옵션을 누락한 데이터는 보류한다. 가격 1원 또는 배송비 1원 차이와 총액이 같은 구성 금액 변화도 별도 관측에 남긴다. 동일 시각의 다른 금액·판매 상태는 충돌이며 재시도에서 이력을 변경하지 않는다.

## 서버 입력 및 신규 등록 절차

실제 외부 API 요청은 구현하지 않았다. 새 서비스 `upsertRetailProducts`는 정규화된 입력 배열과 서버가 읽는 검토 기록을 받아 입력마다 별도 트랜잭션을 실행한다. 소스 정책과 `RETAIL_*_ENABLED` 검사는 Phase 1.1과 동일하다. API 입력은 실제 어댑터 존재도 확인하며 기본값은 미구현이다. 승인된 파일 제공 경로는 다음으로 실행한다.

```sh
node --env-file=.env.local --import tsx server/scripts/refreshRetailPrices.ts --products path/to/products.json
```

현재 소스 정책은 모두 pending이고 검토 파일은 빈 배열이므로 이 명령으로 상품이 자동 생성되지는 않는다. `--import`는 기존에 검증된 listingId 기반의 관측 입력이며, 신규 상품을 생성하지 않는다. 기존 HTML 호출과 원격 소매 workflow 비활성화 상태도 유지한다.

정규화 입력 예시(실제 상품/관측으로 사용하지 않음):

```json
[
  {
    "source": "11ST",
    "externalProductId": "1",
    "url": "https://www.11st.co.kr/products/1",
    "title": "제공 측 실제 상품명",
    "manufacturer": "제조사",
    "model": "정확한 모델",
    "mpn": "실제 제공된 MPN",
    "variants": { "memory": "8GB", "overclock": "OC", "bundle": "카드 1개" },
    "distributor": "확인한 유통사",
    "warranty": "확인한 보증 구분",
    "itemPrice": 100000,
    "shippingFee": 3000,
    "currency": "KRW",
    "condition": "NEW",
    "availability": "IN_STOCK",
    "conditional": false,
    "observedAt": "2026-10-20T00:00:00Z",
    "method": "IMPORT",
    "dataSource": "승인된 공급 계약 식별자"
  }
]
```

검토 기록은 위 입력 내부가 아닌 서버의 `config/retail-product-reviews.json`에 둔다. 공급자에게 파일 수정 권한을 주지 않는다. 형태는 다음과 같다.

```json
[
  {
    "source": "11ST",
    "externalProductId": "1",
    "approvalStatus": "approved",
    "action": "MATCH",
    "productId": "기존-내부-ID",
    "category": "GPU",
    "identity": {
      "manufacturer": "제조사",
      "model": "정확한 모델",
      "mpn": "실제 제공된 MPN",
      "variants": { "memory": "8GB", "overclock": "OC", "bundle": "카드 1개" },
      "distributor": "확인한 유통사",
      "warranty": "확인한 보증 구분"
    },
    "requiredOptionKeys": ["memory", "overclock", "bundle"],
    "reviewedBy": "검토자",
    "reviewedAt": "2026-10-20T00:00:00Z",
    "evidence": "동일성 검증 근거"
  }
]
```

신규 상품은 `action: CREATE`, 명시적인 `category`, 검토한 `productName`을 사용하고 `productId`는 지정하지 않는다. 검토가 완료됐더라도 기존 미검증 카탈로그에 같은 이름의 후보가 있으면 CREATE를 보류한다. 해당 기존 상품의 정체를 먼저 확인해야 한다. 외부 상품명은 동일성 확정 후 바뀔 수 있으나 기존 products.name/category/current_price는 덮어쓰지 않는다.

## 저장 및 보류 결과

- `CREATED`: 검토된 신규 상품·식별 레코드·소매 외부 ID 연결·최초 관측·최신가가 한 트랜잭션에 저장된다.
- `MATCHED`: 검증된 기존 상품 ID를 재사용한다. 같은 판매처의 여러 listing도 각각 가격을 기록한다.
- `HELD`: 식별정보 누락/불일치, 매핑 충돌, 검토 미완료, 분류 불명확, 필수 옵션 또는 유효 가격 누락. 상품·식별정보·연결·가격은 변경하지 않고 보류 큐만 UPSERT한다.
- 보류 큐는 source/external_product_id 고유 키로 최초 확인 시각을 유지한다. 처리 성공 후 삭제하지 않고 resolved_at을 남긴다.
- 실제 SQL 저장 실패는 입력 단위로 rollback하고 배치의 다음 입력은 처리한다. 원본 SQL 오류/인증정보는 로그에 남기지 않는다.

가격 관측은 상품가와 배송비를 별도 칼럼에 보존한다. 신규 API 관측은 method=API와 data_source로 기록할 수 있고, 과거 CRAWL/IMPORT 행은 유지한다. 같은 관측 시각의 같은 금액·판매 상태는 중복 생성하지 않는다. 같은 시각의 다른 금액이나 재고 상태는 OBSERVATION_CONFLICT로 rollback한다. 가격이 같더라도 다른 실제 관측 시각은 기존 008 방식대로 별도 관측이다. 009의 다나와 이벤트 압축 규칙은 변경하지 않았다.

품절은 OUT_OF_STOCK 관측이며, 제공되지 않은 금액은 NULL로 보존한다. 관측을 삭제하지 않고 최신 상태가 품절이면 뷰에서 제외한다. 오래된 관측은 이력에 추가할 수 있으나 최신가/품절 상태를 덮어쓰지 않는다. 기존 12시간 유효성 검사와 뷰 만료 규칙은 유지한다. 총액이 같은 상품가·배송비 변동과 각 금액의 1원 차이도 남는다.

전체 최저가는 별도 숫자를 products.current_price에 덮어쓰는 방식이 아니라 기존 product_current_prices 뷰가 판매처별 최신 유효 총액에서 계산한다. 판매처의 유효 최저가가 있으면 기존 다나와 참고가보다 높더라도 우선한다. 소매 전용 신규 상품은 목록·상세·live 조회에 표현되며, 다나와 월별 이력을 만들지 않는다. 소매 이력은 기존 별도 테이블에서 확인하고, 다나와 이력이 없는 상품의 기존 분석 결과는 데이터 부족으로 유지한다. 순위 계산 정책을 확장하지 않았다.

## 변경 파일 및 적용 순서

신규: `database/010_retail_product_identity.sql`, `config/retail-product-reviews.json`, `server/domain/retailProduct.ts`, `server/repositories/retailProductRepository.ts`, `server/services/retailProductUpsert.ts`, 각 Unit Test와 `database/tests/retailProductUpsert.mts`.
변경: `server/repositories/retailPriceRepository.ts`(공유 트랜잭션 writer), `server/integrations/retail/retailPrice.ts`(품절 관측 계약), `server/scripts/refreshRetailPrices.ts`와 테스트(`--products`), `server/services/productPage.ts`(다나와 매핑 없는 live 조회와 출처 tag).

1. 승인·어댑터가 없는 상태에서는 수집 중단을 유지한다.
2. 별도 DB 백업 및 테스트 후 기존 001~004/008/009가 있는 DB에 010을 적용한다. 005는 적용하지 않는다.
3. 010을 사용하는 서버 코드와 스크립트를 반영한다. 이전 코드에서 상품가/배송비를 항상 NOT NULL로 가정한 자체 도구가 있다면 품절을 먼저 검토한다.
4. 계정·출처별 이용 권한과 실제 인증 수단을 검증하고, 기존 상품의 MATCH 또는 신규 상품의 CREATE 검토 기록을 준비한다.
5. 실제 API 어댑터는 별도 단계에서 구현·검증한다. 이 작업에서 GitHub Actions 배포나 API 호출, 운영 DB 적용은 수행하지 않는다.

## 검증 방법과 범위

```sh
pnpm check
pnpm test
pnpm build
# 이미 제공되는 별도 PGlite 모듈 사용. 프로젝트 dependency 추가 없음.
PRICEPULSE_PGLITE_MODULE=file:///path/to/pglite/dist/index.js pnpm exec tsx database/tests/retailProductUpsert.mts
# 선택: anon/authenticated 역할이 준비된 전용 PostgreSQL 테스트 서버.
# 운영 DB_URL은 읽지 않으며, 임의 이름의 테스트 스키마를 생성·삭제한다.
PRICEPULSE_RETAIL_TEST_PG_URL=postgresql://test-host/test-db pnpm exec tsx database/tests/retailProductUpsert.mts
```

PGlite는 실제 PostgreSQL 엔진의 WASM 빌드다. 제약조건·고유성·트랜잭션 rollback·뷰의 SQL 동작을 검증하며 mock SQL 응답으로 대체하지 않는다. 단일 연결이므로 native 여러 세션 간 advisory lock 경합을 입증하는 테스트와 구분한다. native 테스트 서버 변수를 지정하면 동일한 Promise.all 입력 테스트를 실제 다중 연결로 실행한다. 실행 결과는 후속 검증 기록에 기재한다.

## 최종 검증 기록

- `pnpm check`: 통과.
- `pnpm test`: 168개 통과, 운영 DB 설정이 필요한 기존 통합 테스트 5개 건너뜀.
- `pnpm build`: 프런트엔드·서버 프로덕션 빌드 통과.
- `database/tests/retailProductUpsert.mts`: 별도 설치돼 있던 PGlite에서 17개 PostgreSQL 검증 통과. 마이그레이션 재실행·레거시 행 보존·권한·기존 ID·신규 등록·보류 중복 방지·다중 판매상품·옵션 차이·MPN 충돌·금액·배송비·상승/하락·동일 시각 충돌·오래된 관측·품절/복구·고유성/FK/금액 제약·필수 저장 실패 전체 rollback·다음 입력 처리·조회를 포함한다.
- 기존 `database/tests/priceObservationPolicy.mts`, `database/tests/rankingPolicy.mts` 회귀 검증 모두 통과.
- 네이티브 PostgreSQL 테스트 서버는 제공되지 않아 실제 다중 세션의 잠금 경합 테스트는 미실행이다. 같은 입력을 동시에 보낸 테스트는 PGlite 단일 연결에서 직렬 처리됐고, 실제 고유 제약과 트랜잭션은 PostgreSQL WASM 엔진에서 검증했다. 전용 테스트 서버로 동일 스크립트를 재실행할 수 있다.
- package.json·lockfile과 기존 001/002/005/008/009 SQL 파일은 변경하지 않았다. 신규 dependency, 실제 API 호출, 운영 DB 접속·마이그레이션·데이터 변경, Actions 배포는 없다.
