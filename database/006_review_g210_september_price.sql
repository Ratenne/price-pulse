BEGIN;

-- Requires 003_reviewed_price_exclusions.sql. Preserve the raw Danawa value;
-- quarantine only this reviewed product/month/value from chart and analysis.
-- Checked against the Danawa monthly response on 2026-10-19:
-- Apr-Aug: 22260, 22250, 22920, 22290, 23210 KRW; Sep: 225000 KRW.
-- The source also repeats 225000 in weekly rows; its correctness is unconfirmed.
-- Do not infer a replacement price (for example 22500) from this evidence.
INSERT INTO price_history_exclusions (price_history_id, observed_price, reason)
SELECT h.id, h.price,
  'SUSPECT_HIGH_REVIEW: G210 September 225000 KRW; Apr-Aug 22250-23210 KRW; source verified 2026-10-19; pending confirmation'
FROM product_source_mappings m
JOIN price_histories h ON h.product_id = m.product_id AND h.source = m.source
WHERE m.source = 'DANAWA' AND m.external_product_id = '36709025'
  AND h.price_year_month = DATE '2026-09-01'
  AND h.price = 225000
  AND h.granularity = 'MONTH' AND h.source_type = 'HISTORICAL_IMPORT'
ON CONFLICT (price_history_id, observed_price) DO NOTHING;

COMMIT;
