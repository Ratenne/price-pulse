# 가격 이력 검토

`003_reviewed_price_exclusions.sql`을 PostgreSQL 관리자 연결로 한 번 실행한다.
반복 실행해도 검토 기록이 중복되거나 취소한 판단이 다시 활성화되지 않는다.

원본 `price_histories`는 수정하지 않는다. 검토 제외 목록은 원본 행 ID와
**검토한 가격 값**에 연결된다. 동일 값의 재수집은 계속 제외되고, 다나와가
가격을 수정하면 수정된 값은 분석에 포함된다. 재검토가 필요하면 새 값에
대한 별도 기록을 추가한다. `revoked_at`을 설정하면 판단을 취소할 수 있다.

이번 검토는 원본 API와 대조한 6건을 보수적으로 격리한다. 5건은 앞뒤 월과
동떨어진 단일 월 가격이고, RTX 5090의 66,207,920원은 확인 대기 가격이다.
이는 원천 가격이 틀렸다는 확정 판정이 아니다. 전월 대비 3배 이상 변한
나머지 상품은 품절·판매처 변경 가능성이 있으므로 자동으로 제외하지 않는다.
새 상품이나 새로운 이상치는 자동 판정하지 않으며 추가 검토가 필요하다.

- 통계·최저/최고가·이전 가격·정렬·카테고리 집계: `price_histories_for_analysis`
- 차트: `reviewed_price_histories`에서 제외 사유 없는 가격만 전달한다.
  제외 월은 값 없이 전달하여 선을 끊고 안내한다. 가격을 추정하지 않는다.
- 전체 원본 및 수집: 기존 `price_histories`를 유지한다.
- 분석 가능한 월이 전혀 없는 상품은 통계·순위에서 빠진다.
- 현재 가격 조회는 별개이며 이 과거 월별 가격 검토의 대상이 아니다.

검증: `PRICEPULSE_DB_TESTS=true node --env-file=.env.local node_modules/vitest/vitest.mjs run server/services/priceQuality.integration.test.ts`
DB 테스트는 임시 테이블/뷰와 롤백을 사용하며 실제 상품 데이터를 변경하지 않는다.

```sql
SELECT h.product_id, h.price_year_month, h.price, e.reason, e.reviewed_at
FROM price_histories h
JOIN price_history_exclusions e ON e.price_history_id = h.id
WHERE e.revoked_at IS NULL AND e.observed_price = h.price;
```
