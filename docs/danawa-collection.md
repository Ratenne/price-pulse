# 다나와 가격 수집 운영

가격 이력 관리 v1.0 / 누락 예외 v1.2(A안)의 DB 적용 순서, 상태 분류, 누락 복구 및 검증은
[가격 이력 정책 구현](price-history-policy.md)을 참고한다. 새 코드의 수집 배치를 실행하기 전에
`009_price_observation_policy.sql`을 적용해야 한다.

다나와 외 판매처 수집·사이트별 이력·배송비 포함 최저가와 적용 순서는 [외부 판매처 수집](retail-collection.md)을 참고한다.
외부 판매처가 추가된 코드의 API는 `008_retail_prices.sql`의 뷰가 필요하다.

- 현재가: 기존 `refresh-live-prices.yml`, 3시간마다.
- 등록 상품의 월별 이력: 기존 `refresh-danawa.yml`, 3시간마다 매시 07분.
- GPU 상품 탐색과 과거 이력 수집: `discover-danawa.yml`, 3시간마다 매시 07분.

상품 탐색은 다나와 GPU 목록 전체를 순회해 상품과 매핑을 등록·갱신하고,
24/12/6개월 응답 중 유효한 기간의 완료된 월 가격을 저장한다.
목록에 더 이상 없는 기존 상품의 이력도 계속 갱신할 수 있도록 등록 상품 이력 배치는 유지한다.
현재가 수집 주기와 12시간 유효기간은 기존과 같다.

자동 탐색은 `DANAWA_TARGET_PRICE_COUNT=0`으로 전체 목록을 처리한다.
수동 대량 수집의 기본 목표는 기존과 같이 이력 총 10,000행이며, 0을 지정하면 제한을 해제한다.
과거 이력·페이지 일부 실패는 계속 처리한 뒤 종료 코드 2로 보고한다. DB 오류는 즉시 중단하고 종료 코드 1로 보고한다.
확인된 원본 월별 데이터 부재와 당월만 제공되는 응답은 별도 집계하며 실패에 포함하지 않는다.
목표 행 수 미달 자체로는 실패하지 않는다. 현재가 재확인 실패도 기존 가격과 이력을 보존한다.
대량 Backfill은 현재가 미확보·잘못된 현재가 입력을 경고로 기록하고 과거 이력을 계속 처리한다.
이력·페이지 실패가 없으면 현재가 경고가 있어도 종료 코드 0이며, 완료 로그의 `executionStatus`는 `SUCCESS`다.
현재가 저장·트랜잭션·무결성 예외는 경고로 삼키지 않는다. `currentPriceSuccesses`는 현재가 입력을 정상 처리한 상품 수다.
실패 상품·사유는 상품별 경고 로그와 `currentPriceFailureDetails`에 남기며, `currentPriceFailures` 총계도 유지한다.
`fullScanMode`는 목표 0 여부이며, `excludedCurrentMonthPrices`·`excludedFutureMonthPrices`는 파싱 후 저장에서 제외된 월별 값의 수다.
기존 `skippedPrices`는 모든 기존 월 Skip의 합계를 유지하고, `duplicatePrices`·`conflictingPrices`·`incomparablePrices`로 세분한다.
다나와 월별 최저가의 `MONTH` / `HISTORICAL_IMPORT` 정규화 계약과 안전한 양의 정수 값이 확인된 경우만 동일 가격·불일치를 판정한다.
가격 정의 메타데이터가 없거나 호환되지 않으면 `PRICE_DEFINITION_UNCLEAR`, 안전하게 숫자를 비교할 수 없으면 `UNSAFE_PRICE`로 비교 불가 진단을 남긴다.
배송비·옵션 가격은 추정하지 않는다. 충돌·비교 불가는 기존 월 가격을 보존하고 경고만 남기며 품질 상태를 변경하지 않는다.
비교 진단을 제공하지 않는 저장소의 세부 집계는 0 대신 `null`로 표시한다. 품질 상태별 집계는 아직 제공하지 않는다.
90분 제한에 도달하면 작업이 실패하며 다음 실행은 첫 페이지부터 다시 시작한다.
동일 상품·월의 가격은 중복 삽입하거나 덮어쓰지 않는다. 실제 현재 관측은 별도 테이블에 저장하며
기본가 또는 확인된 배송비의 변동을 기록한다. 동일 가격 재관측은 확인 시각·횟수만 누적한다.

활성화하려면 변경 사항을 GitHub 기본 브랜치에 반영해야 한다.
기존 배치와 동일한 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` 저장소 시크릿을 사용한다.
이번 가격 이력 정책에는 `009_price_observation_policy.sql` 적용이 필요하다. Actions에서 `Discover Danawa Products`를
수동 실행할 수도 있다. 실제 성공 여부와 실패 건수는 Actions 로그에서 확인한다.
