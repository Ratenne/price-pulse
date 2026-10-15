BEGIN;

-- Raw price_histories are never changed by a quality review. A decision applies
-- only to the reviewed value: a subsequently corrected source price is usable.
CREATE TABLE IF NOT EXISTS price_history_exclusions (
  price_history_id bigint NOT NULL REFERENCES price_histories(id),
  observed_price bigint NOT NULL CHECK (observed_price > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (price_history_id, observed_price)
);

-- Conservative, explicitly reviewed quarantine, not a blanket volatility rule.
-- All six values were checked against Danawa's original monthly response.
-- A price spike alone is not proof of a source error; raw evidence is retained.
INSERT INTO price_history_exclusions (price_history_id, observed_price, reason)
SELECT h.id, h.price, reviewed.reason
FROM (VALUES
  ('101546711', DATE '2026-08-01', 1::bigint, 'ISOLATED_LOW: adjacent months 1825960 / 2760680 KRW'),
  ('93703604', DATE '2026-01-01', 393::bigint, 'ISOLATED_LOW: adjacent months 386820 / 399000 KRW'),
  ('90887879', DATE '2025-10-01', 44840::bigint, 'ISOLATED_LOW: adjacent months 448480 / 431480 KRW'),
  ('71901731', DATE '2026-04-01', 75060::bigint, 'ISOLATED_LOW: adjacent months 330000 / 315000 KRW'),
  ('90889754', DATE '2025-12-01', 1900000::bigint, 'ISOLATED_HIGH: adjacent months 558190 / 553840 KRW'),
  ('122726948', DATE '2026-09-01', 66207920::bigint, 'SUSPECT_HIGH_REVIEW: previous month 7712000 KRW; quarantined pending confirmation')
) AS reviewed(external_product_id, price_year_month, observed_price, reason)
JOIN product_source_mappings m ON m.source = 'DANAWA'
 AND m.external_product_id = reviewed.external_product_id
JOIN price_histories h ON h.product_id = m.product_id AND h.source = m.source
 AND h.price_year_month = reviewed.price_year_month
 AND h.price = reviewed.observed_price
 AND h.granularity = 'MONTH' AND h.source_type = 'HISTORICAL_IMPORT'
ON CONFLICT (price_history_id, observed_price) DO NOTHING;

CREATE OR REPLACE VIEW reviewed_price_histories AS
SELECT h.*, e.reason AS exclusion_reason
FROM price_histories h
LEFT JOIN price_history_exclusions e ON e.price_history_id = h.id
 AND e.observed_price = h.price AND e.revoked_at IS NULL;

CREATE OR REPLACE VIEW price_histories_for_analysis AS
SELECT * FROM reviewed_price_histories WHERE exclusion_reason IS NULL;

-- Privileged server access only, consistent with the original tables.
ALTER TABLE price_history_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON price_history_exclusions, reviewed_price_histories,
  price_histories_for_analysis FROM PUBLIC, anon, authenticated;

COMMIT;
