# Phase 4 — 네이버 수집 경계와 상품 파이프라인

검토일: 2026-10-20 (Asia/Seoul).

2026-10-21의 [Phase 4.2](naver-discovery.md)는 JSON 후보와 검증 승격 경계를 추가하고,
검증된 표시가격이 있는 배송비 NULL 관측의 비교를 허용한다. 이 문서는 이전 HTML
경로의 조사 기록이며, 실제 상품 HTML Parser와 운영 수집은 계속 미지원 상태다.

**운영 수집은 불가하며 기본 비활성 상태다.** HTTP 전송 제한과 Phase 2 연계는 구현했지만 허용된 실제 상품 HTML을 확보하지 못해 정상 상품 Parser는 미지원이다. `naverProductParser.verified`는 false이고 승인 JSON·환경변수로 변경할 수 없다. 정상 상품 HTML 추출 또는 실사이트 수집 성공으로 보고하지 않는다.

## 기존 구조 분석

- `retailClient.ts`의 과거 HTML 진입점은 `HTML_COLLECTION_DISABLED`로 유지한다. 기존 오프라인 파서도 삭제하지 않는다.
- `retailProductInputSchema` → `upsertRetailProducts` → `PgRetailProductRepository` → `PgRetailPriceRepository.saveOnClient`를 재사용한다. Repository·상품 동일성 알고리즘·서버 검토 파일은 변경하지 않았다.
- `retailPolicy.ts`는 API/IMPORT만 표현했다. NAVER의 CRAWL을 추가하고 정확한 URL·접근·파서·DB·환경 승인 조건을 확장했다. 다른 판매처의 CRAWL은 거부한다.
- `008_retail_prices.sql`과 `010_retail_product_identity.sql`에는 CRAWL method와 NAVER source가 이미 있다. 신규 마이그레이션·테이블·컬럼은 없다. `005`의 pc\_\* 경로는 활성화하지 않았다.
- 기존 상품 조회와 `product_current_prices`를 사용한다. 다나와 월별 이력·분석·순위 정책, 프런트엔드 및 다른 판매처 API 지원 상태는 변경하지 않았다.
- 소매 workflow는 스케줄 없는 수동 실행 구조를 유지했다. 새 workflow·스케줄은 만들지 않았고 원격 disabled workflow도 재활성화하지 않았다.

## 공식 근거와 대상별 결과

[공식 종료 공지](https://developers.naver.com/notice/article/32564)에서 검색 쇼핑 API의 종료일은 2026-07-31이다. 종료된 API와 비공식 내부 API를 사용하지 않는다.

[서비스 이용약관](https://policy.naver.com/policy/service.html), [서비스 접근 안내](https://policy.naver.com/policy/disclaimer.html), [검색결과 수집 정책](https://policy.naver.com/policy/search_policy.html)을 확인했다. 자동 접근 범위와 콘텐츠 이용 권한은 별도로 검토해야 하며 PricePulse 목적의 가격 저장·분석·재표시 허가를 확보하지 못했다. 판매자별 허가와 최신 개별 서비스 조건도 확인되지 않았다.

| 대상                                  | robots 확인                                                                                             | 상품 페이지·구조 확인                                           | 현재 실행   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------- |
| 쇼핑 검색 `search.shopping.naver.com` | [robots.txt](https://search.shopping.naver.com/robots.txt) 418, text/html 접근 제한. robots 내용 미확인 | 추가 요청 안 함                                                 | 미지원·차단 |
| 쇼핑/카탈로그 `shopping.naver.com`    | [robots.txt](https://shopping.naver.com/robots.txt) 200, 일반 수집기 Disallow: /                        | 추가 요청 안 함. 복수 판매자 가격을 단일 관측으로 취급하지 않음 | 미지원·차단 |
| 스마트스토어 `smartstore.naver.com`   | [robots.txt](https://smartstore.naver.com/robots.txt) 200, 일반 수집기 Disallow: /                      | 추가 요청 안 함                                                 | 차단        |
| 브랜드스토어 `brand.naver.com`        | [robots.txt](https://brand.naver.com/robots.txt) 200, 일반 수집기 Disallow: /                           | 추가 요청 안 함                                                 | 차단        |

조사에서 각 robots URL만 `PricePulse/0.1 (robots policy review)`로 1회 확인했고 거부 뒤 재시도·다른 User-Agent·상품 페이지 접근을 하지 않았다. 검색 호스트의 418과 나머지 세 호스트의 일반 수집 차단을 구분한다. 특정 검색엔진 예외를 PricePulse 허가로 사용하지 않는다. robots는 확인 시점의 결과이며 운영 전 다시 검증해야 한다.

## Collector와 Parser 범위

`naverTarget.ts`의 후보 전송 범위는 HTTPS 스마트스토어/브랜드스토어의 `/{store}/products/{number}` URL뿐이다. 기존 URL 형태를 제한한 것으로 숫자의 실제 ID 체계가 검증됐다는 뜻이 아니다. 검색·카탈로그·쿼리·fragment·사용자정보·별도 포트·임의 호스트·비정규 URL을 거부한다. 정책의 `crawl.allowedUrls`에 있는 정확한 URL만 추가로 허용한다. 현재 승인된 운영 대상은 0개다.

`naverCollector.ts`의 전송 제한:

- Node fetch, 인증/쿠키 없이 PricePulse User-Agent 사용. 같은 호스트도 리다이렉트를 따라가지 않음.
- 동일 origin의 robots를 먼저 확인하고 상품 경로별 규칙 적용. 본문 캐시는 실행별 최대 5분, 다른 호스트에 공유 안 함. 읽기 실패·미지원 규칙은 거부.
- robots 262,144 bytes, HTML 2,000,000 bytes 상한. Content-Length와 실제 스트림 모두 검사. UTF-8 text/plain 또는 text/html만 각각 허용.
- 헤더 대기·본문 읽기를 포함한 기본 10초 Timeout 및 Abort. 비정상 상태·빈 본문·인코딩 오류는 실패 처리.
- 요청 직렬화, 최소 1,500ms와 승인 지연 중 큰 값 적용. robots도 실행 요청 상한에 포함.
- 401/403/418/429 이후 같은 NAVER source의 요청 중단. 자동 재시도 없음. 원문 응답·헤더·비밀값 로그 없음.

robots 평가기는 고정 PricePulse 토큰, ASCII 경로, Allow/Disallow의 단순 glob과 끝 일치 규칙을 지원한다. percent encoding이나 Crawl-delay 등 미구현 구문은 허용으로 추측하지 않고 거부한다. 범용 robots 규격 전체를 구현했다고 주장하지 않는다.

지원하는 규칙의 우선순위는 [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html)의 그룹 결합·최장 규칙·동률 Allow 기준을 따른다. 미지원 구문과 미확인 robots는 표준보다 보수적으로 거부한다.

`naverParser.ts`는 실제 관찰된 접근 제한 메시지의 거부와 미지원 경계만 구현한다. 제조사·모델·MPN/GTIN·판매자·상품 ID·옵션·유통사·보증·일반가·배송비·재고의 네이버 DOM/JSON-LD 계약은 미확인이다. 검색 가격·제목·품절 문자열·임의 structured data를 정상 가격이나 동일성 근거로 사용하지 않는다. JS 실행 환경은 추가하지 않았다.

`__fixtures__/naver-stores.robots.txt`는 두 스토어 호스트의 실제 robots 본문이고 `naver-search-blocked.excerpt.html`은 실제 418 본문 일부다. 정상 상품 HTML fixture는 없다. 합성 전송 HTML이나 합성 정규화 입력을 실제 상품 HTML로 표시하지 않는다.

## 상품·가격 연계

`refreshNaverProducts`는 실행 검사 → Collector → Parser → 공통 입력 검증 → `upsertRetailProducts` 순서다. 기본 Parser 검증 플래그가 false면 robots까지 요청하지 않는다. Parser/Collector 주입은 신뢰된 서버 코드와 테스트 의존성에 한정되며 URL 파일·HTML에서 받지 않는다.

공통 입력에는 source=NAVER, method=CRAWL, dataSource=실제 페이지 URL, Collector의 observedAt이 일치해야 한다. 서로 다른 출처·시각이나 HTML에 넣은 승인 필드는 거부한다. 상품 승인은 기존 `config/retail-product-reviews.json`만 사용한다.

외부 ID는 별도 검증이 필요하다. [네이버 커머스API 운영자 답변](https://github.com/commerce-api-naver/commerce-api/discussions/3170)은 원상품 번호와 채널상품 번호가 서로 다른 체계이며 동일 숫자가 다른 상품일 수 있음을 설명한다. 이 자료로 HTML 숫자·카탈로그 ID·판매자 상품 ID가 같다고 추정하지 않는다. ID 추출·변환은 미구현이다. 승인된 판매자/채널/판매상품/옵션 식별 체계가 입증되어야 매핑에 사용할 수 있다.

입력이 검증되면 Phase 2의 기존 매핑·정확한 동일성·서버 검토 우선순위가 적용된다. 식별정보·필수 옵션 미확인은 기존 큐에 source/external ID로 보류 UPSERT한다. 검토 승인 없는 신규 INSERT는 하지 않는다. 가격 검증 실패도 신규 상품이나 정상 관측을 만들지 않는다.

기존 테이블·트랜잭션으로 상품가/일반 배송비를 따로 저장하며 같은 합계의 구성 변동도 보존한다. 관측은 불변이고 최신 시각만 현재가를 갱신한다. 동일 시각 충돌은 롤백한다. 명시적인 OUT_OF_STOCK만 품절 규칙을 따른다. 전송·파싱 실패는 품절이 아니며 기존 가격을 삭제하지 않는다. 최저가는 기존 뷰의 상품가+배송비 규칙을 따른다.

## 실행과 운영 활성화 조건

`RETAIL_NAVER_ENABLED=false`를 유지한다. 네이버 API 키나 새 Secrets는 없다. CLI 입력은 정확한 URL 문자열 배열이며 승인 설정 자체가 아니다.

```sh
pnpm exec tsx server/scripts/refreshRetailPrices.ts --naver /absolute/path/to/reviewed-urls.json
```

현재는 fetched=0/succeeded=0/skipped, 종료 코드 2다. 미설정은 NOT_CONFIGURED, 미승인은 NOT_APPROVED, 가상 승인만 있고 기본 Parser가 미구현이면 UNSUPPORTED다. DB Pool은 실제 저장이 필요한 경우에만 생성한다. 기존 `--probe`는 계속 차단된다.

운영 전 실제 대상과 데이터 권한을 확보하고 기존 NAVER 정책에 CRAWL method·정확한 URL·승인 근거·검토자·유효기간·사용량을 기록해야 한다. `crawl`에는 automaticAccessAllowed, robotsVerified, parserVerified, databaseVerified, environmentVerified 및 evidence가 필요하다. 값만 true로 쓰는 것은 검증이 아니다. 고정 IP가 필요하면 현재 환경은 기존 정책대로 거부한다.

허용된 실제 HTML과 판매 조건·ID 체계를 확보해 정상 Parser와 fixture를 구현·검토해야 한다. 현재 false를 단순히 true로 바꾸는 것은 활성화 절차가 아니다. 동작하는 기본 상품 수집 경로가 이번에 완성됐다고 취급하지 않는다. robots가 여전히 제한하면 수집하지 않는다. 스케줄 연결과 원격 workflow 활성화는 이후 별도 운영 작업이다.

## 변경 파일

- 신규: `server/integrations/retail/naverTarget.ts`, `naverRobots.ts`, `naverCollector.ts`, `naverParser.ts`, `server/services/naverProductRefresh.ts`.
- 공통 연결: `server/integrations/retail/retailPolicy.ts`, `retailPrice.ts`, `server/services/retailProductUpsert.ts`, `server/scripts/refreshRetailPrices.ts`.
- 테스트: 네이버 Parser/robots/정책/Collector 및 파이프라인 테스트, 기존 CLI 차단 테스트 확장, `database/tests/retailProductUpsert.mts` 확장, `__fixtures__/` 근거와 합성 설정.
- 설명: 이 문서, `docs/retail-collection.md`, `docs/deployment.md`, `.env.example`.
- 승인 JSON·상품 검토 JSON·Repository·SQL·workflow·의존성 파일은 변경하지 않았다.

## 검증 결과

- `pnpm check`, `pnpm build`: API 인증정보 및 RETAIL\_\* 환경변수 없이 통과.
- `pnpm test`: 270개 통과, 별도 DB 설정이 필요한 기존 통합 테스트 5개 건너뜀.
- 오프라인: 실제 접근 제한 발췌 거부, 미지원 구조 거부, robots, URL/승인 차단, Mock HTTP 정상 전송·401/403/418/429·Timeout·타입·크기·리다이렉트·지연/상한·직렬화, 공통 서비스 연계 검증.
- 실제 상품 추출과 제조사/모델/배송/품절 DOM 해석의 정상 성공 테스트: **N/A**. 합성 음성 테스트와 정규화 입력을 실제 추출 성공으로 계산하지 않음.
- `database/tests/retailProductUpsert.mts`: 기존 17개+네이버 합성 정규화 입력 5개, 총 22개 PostgreSQL 엔진 검증 통과. 외부 PGlite 재사용, 프로젝트 의존성 추가 없음. WASM 단일 세션이므로 네이티브 동시 세션 검증을 대체하지 않음.
- 네이버 기존 상품 매칭·신규 검토·보류 중복 방지·1원 변동·배송비·품절·최저가·과거 관측·충돌·롤백과 다른 판매처/다나와 보존 검증.
- 기존 `database/tests/priceObservationPolicy.mts`, `database/tests/rankingPolicy.mts`도 같은 격리 런타임에서 통과. 운영 DB가 아닌 SQL 회귀 검증이다.
- 공개 빌드 산출물에서 네이버 Collector·테스트용 ID·내부 미지원 코드가 발견되지 않았다.
- 운영 DB 접속·DDL 실행·상품 페이지 수집·키 사용·배포·스케줄 활성화는 하지 않았다.
