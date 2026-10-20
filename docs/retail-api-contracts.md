# Phase 3 — 공식 API 계약 검토와 미지원 통제

검토일: 2026-10-20. Phase 1.1/2의 서버·승인 검사·상품 검증·Repository를 기준으로 했다.

**실제 수집 어댑터가 구현·승인된 판매처는 현재 0개다.** 이번 결과는 공식 자료 조사, 인증 설정과 오프라인 서명 도구, 판매처별 실행 불가 진단 및 오류 분류다. 문서에 API가 있다는 사실과 PricePulse가 해당 API로 타 판매자 가격을 저장·분석·재표시할 권한은 구분한다. 빈 배열이나 샘플 가격을 성공 결과로 반환하지 않는다. 서버 API 호출, 실제 토큰 검증, 상품 저장, DB 마이그레이션, workflow 재활성화는 하지 않았다.

## 공식 자료

- 11번가: [현재 포털](https://openapi.11st.co.kr/openapi/OpenApiFrontMain.tmall), [상품검색 가이드](https://openapi.11st.co.kr/openapi/OpenApiGuide.tmall), [상품정보조회 가이드](https://openapi.11st.co.kr/openapi/OpenApiGuide.tmall?commonGuideNo=3), [고객센터 공지](https://openapi.11st.co.kr/openapi/OpenApiNoticeBoard.tmall?method=getNoticeBoardList&noticeYn=Y&unityBrdNo=18).
- 쿠팡: [상품 목록](https://developers.coupang.com/ko/api/products/product-list-paging-query?market=KR), [상품 상세](https://developers.coupang.com/ko/api/products/querying-product?market=KR), [옵션 가격·재고](https://developers.coupang.com/ko/api/products/query-quantitypricestatus-by-product-items?market=KR), [HMAC](https://developers.coupang.com/ko/getting-started/creating-hmac-signature), [키/IP 등록](https://developers.coupang.com/ko/getting-started/issue-open-api-keynew).
- G마켓·옥션: [ESM 승인·JWT](https://etapi.gmarket.com/pages/API-%EA%B0%80%EC%9D%B4%EB%93%9C), [상품 목록](https://etapi.gmarket.com/160), [상품 상세·관리](https://etapi.gmarket.com/20), [2026-08-10 호출량 공지](https://etapi.gmarket.com/220).

공식 포털에 공개된 자료만 근거로 사용했다. 검색 결과의 비공식 SDK·크롤링 서비스·블로그 구현을 API 계약으로 사용하지 않았다. 11번가 포털에는 2026년 키 유효기간 관련 공지가 있고 ESM에도 2026년 운영 공지가 있으나, 문서 접근 성공을 실제 API 응답·계정 발급 성공으로 보고하지 않는다.

## Phase 3-A — 계약 확인표

ESM 공통 문서라도 G마켓과 옥션의 판매자·상품 ID·관측 source는 각각 분리한다.

| 확인 항목              | 11ST                                                                            | COUPANG Seller Open API                                                          | GMARKET                                                                         | AUCTION                                              |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1. 현재 운영 여부      | 포털·legacy 상품검색 문서 공개. ProductSearch의 현 계정 신규 발급/실호출 미확인 | 현 공식 포털과 상품 API 문서 확인. 실호출 미실행                                 | ESM 현 운영 공지·문서 확인. 계정 승인 미확보                                    | 동일한 ESM 현 운영 공지·문서 확인. 계정 승인 미확보  |
| 2. 인증 수단           | 검색 가이드의 key. 실제 사용 가능한 키 종류/발급은 추가 확인                    | Access Key + Secret Key, seller vendorId                                         | ESM master ID·발급 signing secret·issuer·G 판매자 ID                            | ESM master ID·발급 signing secret·issuer·A 판매자 ID |
| 3. Endpoint            | 아래 legacy 문서 URL. 실행 가능한 안전한 전송 계약 미확정                       | 아래 seller-products 경로와 옵션 inventories 경로                                | 아래 ESM goods/search 및 goods/{goodsNo}                                        | 같은 ESM 경로, 사이트별 ID 분리                      |
| 4. Method              | 가이드에 URL query 예시. 이번 확인에서 현재 Method 계약 명시 미확정             | 목록/상세/옵션 조회 GET                                                          | 목록 POST, 상세 GET                                                             | 목록 POST, 상세 GET                                  |
| 5. Request             | key, apiCode=ProductSearch, keyword, pageNum, pageSize 등이 공개됨              | 목록 vendorId, nextToken, maxPerPage 등. 상세 sellerProductId, 재고 vendorItemId | query의 사이트/판매자/상품 조건과 pageIndex/pageSize                            | 사이트·판매자 값을 옥션용으로 분리                   |
| 6. Response            | XML 예시·가격/배송 설명. 예시/필드명 간 차이도 있어 운영 응답 검증 필요         | 목록 code/data/nextToken. 상세와 옵션 조회는 별도 계약                           | items 내 사이트별 상품번호·판매가·재고와 shipping 정보                          | siteGoodsNo/price/stock의 iac 값을 별도로 식별       |
| 7. Pagination          | pageNum/pageSize. 문서 상한 200                                                 | nextToken/maxPerPage, 다음 token 빈 문자열은 종료. 상한 100                      | pageIndex/pageSize, totalItems, 문서 상한 500                                   | 동일한 ESM 방식                                      |
| 8. Rate Limit          | 일일 초과 오류 안내. 정확한 현재 할당량 미확인                                  | 과거 공식 속도제한 안내 존재. 현재 계정별 적용/복구 조건 재확인 필요             | 목록 20회/분, 제한 시 1분 뒤 재조회 공지                                        | 동일 목록 제한. 계정/공통 키 공유 한도는 추가 확인   |
| 9. 검색 범위           | 공개 가이드는 사이트 상품검색 설명. 현재 계정 범위·이용 승인은 미확인           | 인증 판매자 상품 관리. 타 판매자 시장 검색으로 사용하지 않음                     | 승인받은 판매자 상품 관리. 공개 전체 판매자 검색으로 해석하지 않음              | 동일, 옥션 판매자 scope 분리                         |
| 10. 판매가/일반 배송비 | ProductPrice/SalePrice/Delivery 설명만으로 일반 구매 총액 확정 불가             | 옵션 salePrice와 상세 배송 정책 확인 가능. 구매 조건·최신가 결합 검증 필요       | 사이트별 price와 shipping.fee 존재. 배송 정책·옵션별 일반 배송비 확정 추가 검증 | 동일, 옥션 가격은 별도 값 사용                       |
| 11. 재고/품절          | 현 운영 검색 응답의 명시적 재고·조건 필드 미확인                                | 옵션 잔여수량과 판매상태. 하나의 플래그로 재고를 추정하지 않음                   | 사이트별 판매상태·재고 필드 문서화                                              | 옥션 판매상태·재고를 별도 사용                       |
| 12. 저장/분석/재표시   | PricePulse 목적의 승인 근거 미확보                                              | PricePulse 목적·타 판매자 데이터 이용 승인 근거 미확보                           | PricePulse 목적의 승인 근거 미확보                                              | 동일, 별도 판매처 승인 필요                          |
| 13. IP/인프라          | ProductSearch 현재 키별 요구 미확정                                             | 자체 개발 키 발급 시 IP 등록. 기존 정책상 고정 IP 미검증이면 차단 유지           | ESM 인증은 허용 서버 IP 확인. 현재 배치 환경 충족 미확인                        | 동일, G마켓 승인으로 자동 대체하지 않음              |
| 14. 무료 범위          | 포털은 무료 API를 안내. 현재 ProductSearch 이용 범위·한도는 미확인              | 공식 FAQ는 판매자 Open API 무료 안내. PricePulse 사용권과 별개                   | 요금/무료 범위를 확인한 명시 자료 미확보                                        | 동일                                                 |

### 문서에서 확인한 경로 — 실행 코드 아님

- 11번가 legacy 예시는 `http://openapi.11st.co.kr/openapi/OpenApiService.tmall`의 query 방식이다. 이 URL로 비밀키를 보내지 않는다. HTTPS endpoint 지원을 추정해 실제 호출 코드로 바꾸지도 않았다. 현재 운영 계약과 키 발급·데이터 이용 범위를 먼저 확인해야 한다.
- 쿠팡 목록: `GET https://api-gateway.coupang.com/v2/providers/seller_api/apis/api/v1/marketplace/seller-products`. 상세는 같은 기반의 `/{sellerProductId}`다. 현재 수량/가격/상태 조회는 `GET https://api-gateway.coupang.com/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/{vendorItemId}/inventories`다. 노출 productId를 판매자 등록 상품/옵션 ID로 치환하지 않는다.
- ESM 목록: `POST https://sa2.esmplus.com/item/v1/goods/search`. 상세: `GET https://sa2.esmplus.com/item/v1/goods/{goodsNo}`. 마스터 goodsNo와 사이트 상품번호를 혼동하지 않는다. 목록 문서에서 사이트 조건은 1=옥션, 2=G마켓이며, JWT 판매자 구분은 별도로 A/G다.

쿠팡 [이전 공식 속도제한 안내](https://developers-v1.coupangcorp.com/hc/ko/articles/20414599556889-Open-API-%EC%86%8D%EB%8F%84%EC%A0%9C%ED%95%9C-%EC%A0%95%EC%B1%85-%EB%8F%84%EC%9E%85-%EC%95%88%EB%82%B4)는 판매자별 제한과 가변 기준을 설명한다. 현재 계약으로 무조건 고정된 숫자/재시도 시간을 가정하지 않는다. [판매자 Open API 무료 FAQ](https://developers.coupangcorp.com/hc/en-us/articles/360023110393-Do-I-have-to-pay-for-Coupang-open-API-service)는 가격 이력 재사용 권한을 부여하는 문서로 취급하지 않았다.

쿠팡 파트너스는 별도 광고/제휴 서비스다. [공식 파트너스 가이드](https://partners.coupangcdn.com/partners-guide/partners-guide-20241216163254.pdf)에 상품 API 안내가 있다는 사실을 Seller Open API의 타 판매자 조회 권한으로 옮기지 않는다. 파트너스 계정·최신 계약·상세 응답·일반 배송비·가격 이력 저장 권한도 이번에 검증되지 않아 연동하지 않았다.

ESM의 “실시간 가격·재고 체크” 메뉴는 [G마켓/옥션이 제휴사에 요청하는 연동](https://etapi.gmarket.com/category/%EC%84%9C%EB%B9%84%EC%8A%A4%20API/%EC%8B%A4%EC%8B%9C%EA%B0%84%20%EA%B0%80%EA%B2%A9,%EC%9E%AC%EA%B3%A0%20%EC%B2%B4%ED%81%AC)으로 설명되어 있다. 이를 PricePulse가 임의 상품 가격을 읽는 공개 API로 구현하지 않았다.

## 구현 범위

- `retailApiConfig.ts`: 네 판매처와 실제 문서의 인증 요소에 대응하는 서버 환경변수 이름. 공유 ESM 키와 서로 다른 판매자 ID 분리.
- `retailApiSupport.ts`: 문서 근거·범위·미지원 사유, 활성화/정책/인증정보/미구현 상태 진단. 모든 `adapterImplemented` 값은 false다. `requireRetailApiAdapter`는 오류를 반환하며 샘플·빈 결과를 성공으로 반환하지 않는다.
- `coupangAuth.ts`: 공식 HMAC 메시지·UTC 시각·서명 헤더를 계산하는 오프라인 함수. 인증 외 HTTP 동작이나 IP 등록 충족을 주장하지 않는다.
- `esmAuth.ts`: 공식 JWT HS256 헤더·payload·서명을 계산하는 오프라인 함수. G/A의 ssi를 각각 생성한다. 문서에 없는 만료 규칙이나 auth endpoint는 추가하지 않았다.
- `retailApiError.ts`: 인증정보 누락/설정 오류, 인증 실패, 권한 부족, rate limit, 외부 장애, timeout, 응답 구조 오류 및 향후 상품·배송 검증 오류를 구분하는 코드. 외부 본문·키·인증 헤더는 오류 메시지에 넣지 않는다.
- `refreshRetailPrices.ts --api-status`: 외부 HTTP와 DB 접근 없이 네 판매처 상태를 출력한다. 기본 배치에도 판매처별 진단을 연결했다.
- `retailPriceRefresh.ts`: HTTP 오류를 사용하는 후속 구현에서 401/403/429는 해당 source를 이번 실행에서 더 호출하지 않도록 기존 실패 분류와 연계했다. 외부 장애를 UNAVAILABLE_OFFER로 바꾸거나 기존 가격을 제거하지 않는다. 자동 재시도는 추가하지 않았다.

**구현하지 않은 것:** 판매처 API의 HTTP 요청, 판매자 상품 검색을 전체 시장 검색으로 전환하는 기능, raw response normalizer, 판매처별 pagination 실행, 실제 가격 수집, 네이버 연동. 공식 이용 범위가 충족되지 않아 이 기능을 구현 완료로 표시하지 않는다. 성공 응답/빈 목록/배송비 누락/페이지네이션 fixture를 가짜 vendor 응답으로 만들어 테스트 통과로 표시하지 않는다.

Phase 2의 정규화된 입력 검증·상품 동일성·보류·금액·배송비·품절·실제 관측 시각·트랜잭션은 유지한다. 지원을 검증한 API를 구현할 때 해당 경계로 변환해야 한다. 원본 필드가 없으면 0원 배송비/KRW/재고 있음/제조사/모델/현재 시각을 임의 보충하면 안 된다.

## 환경변수와 배포

`.env.example`의 변수는 모두 서버 전용이다. 실제 비밀값은 넣지 않았으며 VITE\_ 접두사도 사용하지 않는다.

| API 구분        | 서버 환경변수                                                                    | 현재 사용 상태                         |
| --------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| 11ST 문서상 key | RETAIL_11ST_API_KEY                                                              | 설정 진단만 가능, 실수집 미지원        |
| COUPANG Seller  | RETAIL_COUPANG_ACCESS_KEY / RETAIL_COUPANG_SECRET_KEY / RETAIL_COUPANG_VENDOR_ID | 오프라인 HMAC·설정 진단, 실수집 미지원 |
| ESM 공통        | RETAIL_ESM_MASTER_ID / RETAIL_ESM_SECRET_KEY / RETAIL_ESM_ISSUER                 | 오프라인 JWT·설정 진단, 실수집 미지원  |
| GMARKET 판매자  | RETAIL_GMARKET_SELLER_ID                                                         | G 판매자 토큰 및 설정 진단             |
| AUCTION 판매자  | RETAIL_AUCTION_SELLER_ID                                                         | A 판매자 토큰 및 설정 진단             |

로컬은 기존 실행 방식으로 보안 `.env.local`을 읽고, 서버는 같은 이름의 보안 환경변수로 주입한다. GitHub Actions에서 사용할 때는 키·Secret·계정 식별정보를 같은 이름의 Repository/Environment **Secrets**에 넣어야 한다. 활성화 플래그만 기존 Repository Variables로 관리한다. 아직 수집기가 없으므로 workflow에 Secrets 참조·HTTP 단계·스케줄을 추가하지 않았고 기존 소매 workflow의 disabled 상태도 변경하지 않았다.

향후 승인된 어댑터를 구현한 뒤에는 그 실행 step의 env에 필요한 Secrets를 명시적으로 연결해야 한다. GitHub Secret이 있다는 이유만으로 프로세스 환경에 자동 전달되지는 않는다. 값 출력, set -x, Authorization 출력, 전체 process.env 출력은 금지한다. React에 인증 설정이나 서명 함수도 전달하지 않는다.

API 키가 있어도 `config/retail-source-policies.json`의 pending 상태를 자동 승격하지 않는다. 승인 근거·계정 범위·타 판매자 조회·저장·분석·재표시·사용량·IP 조건을 검증해야 한다. 현재 고정 IP 검증 경로가 없다는 기존 제한도 유지한다. 단순히 requiresFixedIp를 false로 바꾸는 것은 환경 검증이 아니다.

```sh
# 진단 전용. 미설정·미승인·미지원은 수집 성공에 포함하지 않는다.
node --env-file=.env.local --import tsx server/scripts/refreshRetailPrices.ts --api-status
# 인증정보 없이도 실행 가능
pnpm exec tsx server/scripts/refreshRetailPrices.ts --api-status
pnpm check
pnpm test
pnpm build
```

`--api-status`는 현재 targeted=4/succeeded=0/skipped=4를 보고하며 종료 코드 2다. 코드 2는 가격을 수집했다는 성공으로 처리하지 않는 기존 배치 규칙이다. 진단 자체는 DB·외부 네트워크를 사용하지 않는다.

## 판매처별 최종 상태

| 판매처  | 구현한 기능                       | 미지원 기능                             | IP 조건                        | 저장·재표시 승인 | 실제 API 호출 | Mock 검증                 | 미해결                                                      |
| ------- | --------------------------------- | --------------------------------------- | ------------------------------ | ---------------- | ------------- | ------------------------- | ----------------------------------------------------------- |
| 11ST    | 인증정보 설정·상태 진단·호출 차단 | 실제 검색/조회/원본 정규화/페이지네이션 | 현재 key별 미확인              | 미확인           | 미실행        | 설정·승인·미지원 차단     | ProductSearch 현재 이용·키 발급·전송·정확한 배송비·이용권한 |
| COUPANG | 설정·HMAC·상태 진단·호출 차단     | PricePulse 목적의 타 판매자 수집        | 등록 필요, 환경 미검증         | 미확인           | 미실행        | 설정·승인 차단·HMAC 벡터  | Seller/Partners 계약 구분과 데이터 범위·재사용권            |
| GMARKET | 설정·G용 JWT·상태 진단·호출 차단  | 공개 전체 판매자 수집·원본 정규화       | 허용 서버 IP 요구, 환경 미검증 | 미확인           | 미실행        | 설정·승인 차단·JWT/G 식별 | API 이용 승인·조회 범위·일반 배송 조건·재사용권             |
| AUCTION | 설정·A용 JWT·상태 진단·호출 차단  | 공개 전체 판매자 수집·원본 정규화       | 허용 서버 IP 요구, 환경 미검증 | 미확인           | 미실행        | 설정·승인 차단·JWT/A 식별 | API 이용 승인·옥션 별도 ID/관측·재사용권                    |

HTTP 401/403/429/5xx 및 timeout/일시 네트워크 장애의 테스트는 **공통 오류 분류와 기존 서비스 회귀 Mock**이다. 판매처 실연동이나 정상 수집 테스트가 아니다. 미지원 판매처의 정상 응답·빈 목록·잘못된 body·배송비 누락·페이지네이션·중복 조회를 실제 vendor parser가 처리했다는 결과는 N/A다. 추후 계약이 확인되면 해당 API의 실제 공식 schema fixture와 HTTP Mock을 추가해야 한다.

## 최종 검증 기록

- `pnpm check`: 통과.
- `pnpm test`: 204개 통과, 별도 운영 DB 설정이 필요한 기존 테스트 5개 건너뜀.
- `pnpm build`: `RETAIL_*` 환경변수 0개, API 키 없이 통과. 공개 산출물에서 신규 인증 변수명·서명 함수·테스트용 credential sentinel이 발견되지 않았다.
- 판매처 네 곳 각각 미설정·키만 설정·각 인증 요소 누락·가상 승인 후에도 어댑터 미지원·HTTP 요청 0건을 검증했다. 가상 승인 정책은 테스트 내부에만 있다.
- CLI의 별도 프로세스에서 fetch/TCP를 차단한 채 `--api-status`를 검증했다. 성공 0건, 건너뜀 4건, DB 연결 0건이며 비밀값은 출력하지 않는다.
- 쿠팡 HMAC 및 ESM JWT는 고정 시각의 독립 계산 서명 벡터로 검증했다. 실제 계정 인증 성공을 뜻하지 않는다.
- 공통 HTTP 오류/네트워크 오류 분류 및 401/403/429 발생 후 같은 판매처 중단·가격 저장 안 함을 Mock으로 검증했다.
- 기존 `database/tests/retailProductUpsert.mts`의 17개 격리 PostgreSQL 검증 통과: 기존 데이터 보존, 관측 불변성, 트랜잭션 롤백, 상품/가격 조회 회귀 포함. 기존 외부 PGlite 검증 런타임을 재사용했으며 프로젝트 의존성은 추가하지 않았다. 단일 세션 WASM 검증이므로 네이티브 PostgreSQL 동시 세션 lock 경합 검증을 대신하지 않는다.
- 운영 DB 변경·마이그레이션 실행·실제 API 호출·배포·workflow 재활성화는 하지 않았다. 소매 스케줄 제거와 기존 HTML 차단을 유지했으며 다나와 스케줄은 변경하지 않았다.
