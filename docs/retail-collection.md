# 다나와 외 판매처 가격 수집

2026-10-21 Phase 4.2: [Discovery·배송비 미확인 정책](naver-discovery.md)을 추가했다.
배송비 NULL은 검증된 표시가격이 있을 때 비교에 참여한다. 아래 이전 단계의
배송비 필수 설명과 검증 수치는 당시 기록이며, 실수집 중단 상태는 유지한다.

2026-10-20 Phase 1.1: 코드에서 미승인 소매 HTML 자동 수집을 차단했다. 실제 API 요청 구현과 운영 DB 변경은 포함하지 않는다. 원격 `Refresh Retail Prices` workflow도 GitHub에서 수동 비활성화하고 Disabled 표시를 확인했다.

Phase 3의 공식 계약 검토·서버 인증정보 변수·판매처별 미지원 사유와 최신 검증 결과는
[소매 API 계약 문서](retail-api-contracts.md)를 따른다. 아래 Phase 1.1 기록의
검증 수치는 당시 결과다. 네 판매처 모두 실제 API 수집은 계속 비활성 상태다.

Phase 4의 네이버 전송 제한·미지원 Parser·공통 저장 연계와 최신 검증은
[네이버 수집 문서](naver-collection.md)에 기록했다. 실제 네이버 상품 수집은 승인 및
허용된 상품 HTML 미확보로 비활성 상태다.

## 현재 실행 상태

| 판매처     | API·데이터 이용 승인 | 현재 동작                                  |
| ---------- | -------------------- | ------------------------------------------ |
| 11번가     | 미확인 / pending     | 외부 요청 전 차단                          |
| 쿠팡       | 미확인 / pending     | 외부 요청 전 차단                          |
| G마켓      | 미확인 / pending     | 외부 요청 전 차단                          |
| 옥션       | 미확인 / pending     | 외부 요청 전 차단                          |
| 네이버쇼핑 | 미확인 / pending     | 외부 요청 전 차단, 네이버 크롤링은 범위 밖 |

이 표는 현재 API 제공 여부에 관한 판정이 아니다. 저장소에 실행을 승인할 근거가 없다는 뜻이다.
과거 11번가 HTML 응답 1건의 파싱 성공과 나머지 3건의 ACCESS_BLOCKED 결과는 API 접근·가격 이용 승인이 아니다.
API 엔드포인트와 키 이름을 추측해 추가하지 않았다.

- `.github/workflows/refresh-retail-prices.yml`의 `27 */3 * * *` 스케줄을 제거했다. `workflow_dispatch`는 유지한다.
- 기본 배치와 `--links`는 활성화 설정·정책·인증정보·어댑터 검사를 통해 실행 불가 상태를 보고하고 종료 코드 2로 끝난다. DB 연결·상품 연결 등록·가격 쓰기를 하지 않는다.
- `--probe`가 호출하는 기존 `fetchRetailOffer`는 외부 요청 없이 `HTML_COLLECTION_DISABLED`로 실패한다. 재시도·우회 경로는 없다.
- 기존 HTML 파서는 `retailPrice.test.ts`의 오프라인 fixture 검증에서만 사용한다. 수집 클라이언트는 파서를 import하지 않는다.
- `refreshRetailPrices` 서비스는 정책 검증을 통과한 판매처만 명시적으로 주입한 API 어댑터를 호출한다. 기본 어댑터는 없다.
- 미승인·키 누락·어댑터 미구현은 `skipped`이며 성공으로 집계하지 않는다. `save`나 `failed`도 호출하지 않으므로 기존 성공 시각과 가격을 변경하지 않는다.
- `--import`도 명시적으로 활성화한 승인된 파일 공급 경로만 허용한다. 모든 행의 정책을 DB 연결 전에 확인하고, 전체 행의 상품 연결·관측 검증을 끝낸 뒤 저장한다. 잘못된 입력/정책은 종료 코드 1이다.

**원격 자동 실행 중단 완료:** 2026-10-20 GitHub의 [Refresh Retail Prices](https://github.com/Ratenne/price-pulse/actions/workflows/refresh-retail-prices.yml)를 수동 비활성화했다. 화면의 “This workflow was disabled manually”와 Disabled 표시를 확인했다. 실행 목록에는 완료된 실패 1건만 있었고 진행 중/대기 중 실행은 없었다. 다나와 등 다른 workflow는 변경하지 않았다.

원격 main 파일에는 아직 기존 cron이 남아 있으나 workflow 자체가 disabled 상태라 재활성화 전까지 다음 실행을 막는다. 코드의 cron 제거·수동 실행 통제는 이 브랜치가 기본 브랜치에 반영되어야 적용된다. 승인과 실제 어댑터 없이 workflow를 재활성화하지 않는다. 운영 배포와 Secrets 설정은 수행하지 않았다.

## 기존 구조 분석 및 유지 범위

실행 경로는 workflow / `pnpm refresh:retail` → `server/scripts/refreshRetailPrices.ts` → `refreshRetailPrices` → `PgRetailPriceRepository`였다. 과거 클라이언트는 11번가 전용 파서와 다른 판매처 공통 schema.org 파서로 분기했다. 현재 이 네트워크 경로는 차단됐다.

- `database/005_price_collection.sql`: `pc_source_policies` 등 별도 확장 설계가 있다. 서버·API·Actions에서 `pc_*`를 호출하는 코드는 검색되지 않았다. 운영 DB에 적용됐는지는 이 작업에서 접속·확인하지 않았다. 005를 활성화하거나 기존 승인 행을 변경하지 않는다.
- 기존 활성 수집 경로에 정책 로더가 없어, 005의 승인 상태·저장 허용·근거·만료·고정 IP 개념을 작은 서버 정책 검사로 적용했다. 별도 DB 정책 시스템을 가동하지 않는다.
- `database/008_retail_prices.sql`: `retail_product_links`, `retail_price_observations`, `retail_current_offers`, `product_current_prices`를 정의하는 실제 소매 경로다. SQL과 Repository의 기존 저장 구조를 유지했다.
- `/api/products` → `productsHandler` → `readProductPage`는 `product_current_prices` 및 기존 이력 조회를 사용한다. React의 `productService`와 화면도 유지했다. 조회 시 소매 사이트를 요청하지 않는다.
- 기존 상품·가격·연결·이력은 삭제하지 않는다. 12시간 유효 기간과 다나와 참고가 대체 규칙은 그대로이므로 수집 중단 후 오래된 현재가는 기존 규칙대로 만료된다.
- 다나와 수집 workflow, 월별 차트, 기간별 순위, 최저가 집계는 변경하지 않는다. 새 서버·프레임워크·DB·dependency를 추가하지 않았다.

## 환경변수와 실행 상태

다음 활성화 변수는 서버 실행 시 읽으며 기본값은 false다. 문자열 `true`만 활성으로 인정한다.

| 판매처     | 활성화 변수              | 기본값 |
| ---------- | ------------------------ | ------ |
| 11번가     | `RETAIL_11ST_ENABLED`    | false  |
| 쿠팡       | `RETAIL_COUPANG_ENABLED` | false  |
| G마켓      | `RETAIL_GMARKET_ENABLED` | false  |
| 옥션       | `RETAIL_AUCTION_ENABLED` | false  |
| 네이버쇼핑 | `RETAIL_NAVER_ENABLED`   | false  |

로컬/서버는 실행 환경에서 설정한다. 기존 스크립트는 `.env.example`을 자동 로드하지 않으므로 로컬 파일 사용 시 `node --env-file=.env.local --import tsx server/scripts/refreshRetailPrices.ts`로 실행한다. Actions 수동 배치는 같은 이름의 GitHub Repository Variables를 명시적으로 전달하고 미설정이면 false로 둔다. API 비밀값은 Variables에 넣으면 안 된다.

`checkRetailExecution`을 배치 서비스와 수동 실행·import의 공통 진입 검사로 사용한다. 환경변수 활성화와 이용 승인은 별도 조건이다.

| 상태             | 의미                                                       | 요청/성공/가격 쓰기 |
| ---------------- | ---------------------------------------------------------- | ------------------- |
| `NOT_CONFIGURED` | 기능 비활성 또는 승인된 API의 인증정보 일부/전체 누락      | 모두 0              |
| `NOT_APPROVED`   | 승인·상품 조회·저장·분석·재표시·실행 환경 검증 불충족/만료 | 모두 0              |
| `UNSUPPORTED`    | 승인된 API 제공 여부가 확인되지 않거나 실제 어댑터 없음    | 모두 0              |

검사 순서는 활성화 → 정책 및 실행 환경 → 전체 인증정보 → 어댑터다. 승인된 API의 미제공 상태도 UNSUPPORTED로 분류한다. 기존 정책 오류 코드는 로그의 `code`에 유지하고, `status`와 배치 요약의 `skipStatuses`로 위 상태를 보고한다. 활성화해도 키만으로 수집을 실행할 수 없다. 실제 호출 실패는 기존 `ACCESS_BLOCKED` 등 실패 처리와 판매처 단위 중단을 유지한다.

### 인증 규격 확인 범위

이번에는 가격 수집에 사용할 공식 API 상품과 이용 계정이 확정되지 않아, 실서비스 인증정보 변수나 엔드포인트를 새로 정의하지 않았다. `credentialEnvNames`는 실제 어댑터 검토 시 공식 문서로 확인한 모든 인증 요소의 서버 변수 이름을 지정하는 계약이다. 테스트의 `RETAIL_TEST_*`는 가상 인증정보이며 실서비스 규격이 아니다. 하나만 설정해도 실행할 수 있게 만들지 않았다.

쿠팡 [공식 OpenAPI 설명](https://developers.coupang.com/en/faq/what-is-an-openapi-key)은 Access Key/Secret Key와 판매자 vendorId를 설명하고, [키 발급 문서](https://developers.coupang.com/en/getting-started/issue-open-api-keynew)는 판매자 등록과 자체 개발 시 IP 등록을 안내한다. 이 판매자용 규격을 타 판매자 가격 조회 권한으로 간주하지 않는다.
11번가의 [공식 기술 발표](https://techtalk.11stcorp.com/2023/pdf/TECH-TALK-2023_SESSION-04.pdf)에서도 Open API Center의 API Key 발급을 설명하지만, 이것만으로 현재 사용할 API의 상세 인증 규격·이용권한이 확인되지는 않는다. G마켓·옥션도 이번 조사에서 해당 가격 수집 목적에 맞는 공식 인증 규격과 권한을 확정하지 못했다. 따라서 모든 판매처의 승인은 pending으로 유지한다.

## 판매처별 승인 정책

`config/retail-source-policies.json`은 현재 다섯 판매처 모두 `pending`이다. 서버의 `retailPolicy.ts`만 이 파일을 읽는다. 기존 DB의 `pc_*` 승인이나 API 키만으로 이 값을 자동 승격하지 않는다.

승인 검토 후 소스별로 다음 정보를 기록해야 한다. 검토자는 약관 또는 계약의 실제 허용 범위와 실행 환경을 확인해야 하며, 플래그만 변경하는 것은 승인 근거가 아니다.

- `approvalStatus`: approved / pending / rejected / suspended. 실행하려면 approved여야 한다.
- `methods`: API 및/또는 IMPORT. API는 `apiAvailable: true`도 필요하다. 승인된 파일 공급은 API 제공 여부와 독립적이다.
- `accessGranted`, `thirdPartyProductsAllowed`, `storageAllowed`, `historyAnalysisAllowed`, `redisplayAllowed`: 각각 실제 접근 권한, 타 판매자 상품 조회, 저장, 가격 이력 분석, 재표시 권한. 모두 true여야 한다.
- `termsUrl`, `evidence`, `approvedBy`, `verifiedAt`, `expiresAt`: 근거와 검토 기록. 누락·미래 검토일·만료는 차단한다.
- `usageLimitsVerified`, `maxRequestsPerRun`, `minDelayMs`: 사용량·호출 주기 제한과 실제 배치 환경 확인. 서비스는 판매처별 호출 횟수와 최소 간격(하한 1.5초)을 적용한다. 공급자의 일별·계정별 공유 한도 등은 향후 실제 어댑터에서 추가로 보장해야 한다.
- `requiresFixedIp`: 현재 검증된 고정 IP 실행 경로가 없어 true면 차단한다. GitHub Actions를 고정 IP 환경으로 가정하지 않는다.
- `credentialEnvNames`: 실제 계약에 맞춰 정한 `RETAIL_*` 서버 환경변수 이름 목록. API는 비어 있거나 값이 누락되면 차단한다. IMPORT에는 API 키를 요구하지 않는다.

정책 파일에는 비밀값을 넣지 않는다. API 인증정보는 서버 환경/Actions Secrets에만 보관하고 `VITE_*`에 넣지 않는다. 로그는 정책 오류 코드만 기록하고 토큰·헤더·원본 오류를 출력하지 않는다. 기존 `DB_*`, `RETAIL_BATCH_LIMIT` 이름은 유지한다.

## 공통 수집 계약과 저장 경계

`RetailCollection` / `collectionSchema`는 기존 `RetailObservation` 필드를 재사용하고 `RetailLink`와 같은 `source`, `url`을 사용한다. 추가 필드는 `externalProductId`, 선택적 `manufacturer`, `model`, `method`(API/IMPORT), `dataSource`이다. 기존 `title`, `itemPrice`, `shippingFee`, `currency`, `availability`, `observedAt`이 상품명·상품가·일반 배송비·통화·판매 상태·실제 관측 시각을 표현한다.

공급자가 제공하지 않는 관측 필드는 생략할 수 있다. 저장 전 `collectionObservation`이 기존의 완전한 `RetailObservation`으로 검증한다. 배송비·실제 관측 시각·판매 조건이 누락되면 저장하지 않으며 0원 배송, 현재 시각, KRW, 재고 있음 등의 값을 임의로 만들지 않는다. 현재 저장 계약은 KRW/새상품/일반 구매/재고 있음만 수용한다. 다른 상태의 공급 응답은 어댑터가 별도 처리해야 한다.

008의 관측 `method`는 CRAWL/IMPORT만 허용한다. 스키마 변경 없이 승인된 외부 관측은 기존 IMPORT로 저장한다. 새 CRAWL 관측을 생성하지 않는다. 기존 연결에 source/URL, 관측에 가격·배송비·시각이 남으며, 신규 외부 상품 ID·제조사·모델·세부 dataSource 및 API/파일 구분은 현재 DB 컬럼에 영속화되지 않는다. 어댑터 경계의 검증용 메타데이터이며, 세부 감사 이력 저장이 필요한 계약은 별도 설계·승인 전 실행하면 안 된다.

실제 API 연동 시에는 승인 근거와 제한을 검토하고, 실제 문서로 확인한 어댑터를 구현해 `refreshRetailPrices`의 `collect`에 연결한다. 서비스는 활성화·승인·키·횟수 제한을 호출 전에 검사하며, 반환값의 출처·상품 연결·실제 관측값을 검증한 후 기존 Repository를 재사용한다. 이번에는 API 요청 구현과 스케줄 재개를 하지 않는다.

## 실행과 검증

```sh
pnpm refresh:retail                 # 현재 skipped 4, succeeded 0, 종료 2, DB 연결 없음
pnpm refresh:retail --probe         # HTML_COLLECTION_DISABLED, 종료 2
pnpm refresh:retail --list          # 기존 DB의 등록된 연결 조회만 수행
pnpm refresh:retail --import path/to/observations.json
pnpm check
pnpm test
pnpm build
```

파일 입력은 다음 형태의 JSON 배열이다. 아래 값은 형식 설명이며 실제 관측으로 사용하지 않는다. 공급자 승인과 실제 관측값이 없으면 입력할 수 없다. 기존 출처 없는 관측 파일은 더 이상 허용하지 않는다.

```json
[
  {
    "source": "11ST",
    "url": "https://www.11st.co.kr/products/1",
    "externalProductId": "1",
    "method": "IMPORT",
    "dataSource": "승인된 공급 계약의 식별자",
    "listingId": 1,
    "title": "기존 연결의 listingName과 같은 전체 상품명",
    "itemPrice": 100000,
    "shippingFee": 3000,
    "currency": "KRW",
    "condition": "NEW",
    "availability": "IN_STOCK",
    "conditional": false,
    "observedAt": "2026-10-20T00:00:00Z"
  }
]
```

테스트는 정책 미승인/누락/만료/권한 부족/고정 IP/키 누락 시 차단, 제한 적용, 필수 관측 누락 거부, 기존 가격 조회를 검증한다. 별도 프로세스에서 fetch와 소켓 연결을 차단한 채 기본 배치·probe·import를 실행해 네트워크 호출이 없음을 확인한다. 운영 DB를 사용하는 기존 통합 테스트는 별도 설정이 없으면 건너뛴다. 운영 데이터에 접속하거나 SQL을 적용하지 않는다.

## 변경 파일과 검증 결과

- `.github/workflows/refresh-retail-prices.yml`: 소매 자동 스케줄 제거, 수동 실행 유지, 판매처별 Repository Variables 연결.
- `config/retail-source-policies.json`: 판매처별 pending 기본 정책.
- `server/integrations/retail/retailPolicy.ts`: 활성화·승인·권한·기한·환경·어댑터 검사와 실행 상태 구분.
- `server/integrations/retail/retailClient.ts`: 기존 HTML 호출 차단.
- `server/integrations/retail/retailPrice.ts`: 공급자 공통 계약과 저장 전 검증.
- `server/services/retailPriceRefresh.ts`: 요청 전 승인 검사, skip 집계, 어댑터 경계와 제한.
- `server/scripts/refreshRetailPrices.ts`: 수동 배치/probe/import 차단, 승인 없는 DB 연결 방지.
- `.env.example`: 판매처별 비활성 기본값과 서버 인증정보 규칙 안내.
- `server/integrations/retail/retailPolicy.test.ts`, `retailPrice.test.ts`, `server/services/retailPriceRefresh.test.ts`, `server/scripts/refreshRetailPrices.test.ts`, `server/services/productPage.test.ts`: 차단·정책·회귀 검증.
- `docs/retail-collection.md`: 구조 분석·운영 전제·승인 절차·제한 기록.

`pnpm check`, `pnpm build` 및 전체 테스트 결과는 아래 Phase 1.1 검증 기록에 정리한다. 원격 소매 workflow만 비활성화했으며 운영 DB 데이터는 변경하지 않았다.

## Phase 1.1 검증 기록

- `pnpm check`: 통과.
- `pnpm test`: 151개 통과, 운영 DB가 필요한 기존 통합 테스트 5개 건너뜀.
- `pnpm build`: 실제 API 인증정보와 `RETAIL_*` 환경변수 없이 통과.
- 별도 프로세스에서 외부 fetch/TCP를 차단하고 기본 배치·활성화만 된 배치·기존 probe·미승인 import를 검증했다. 외부 API 요청 및 DB 연결은 0건이다.
- 미설정(NOT_CONFIGURED), 미승인(NOT_APPROVED), 어댑터 미구현/API 미지원(UNSUPPORTED)을 각각 검증했다. 모두 성공 0건이며 `save`/`failed`를 호출하지 않는다.
- 기존 소매 관측·다나와 참고가와 상품 조회·프런트엔드 데이터 처리 테스트를 유지했다. DB 연결 및 SQL 실행은 하지 않았다.
- HTML 파서와 fixture, 기존 가격·상품·이력·SQL·Repository 저장 구조는 보존했다. 실제 API·상품 INSERT·매칭·UI 개편은 추가하지 않았다.
