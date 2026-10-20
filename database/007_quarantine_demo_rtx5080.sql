-- Run this entire file in the production Supabase SQL Editor as administrator.
-- Preserve the product and raw prices; archive and detach the incorrect mapping.
BEGIN;
SET LOCAL search_path = public, pg_temp;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS product_source_mapping_quarantine (
  product_id text NOT NULL,
  source text NOT NULL,
  external_product_id text NOT NULL,
  original_row jsonb NOT NULL,
  reason text NOT NULL,
  quarantined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, source, external_product_id)
);
ALTER TABLE product_source_mapping_quarantine ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON product_source_mapping_quarantine FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM 1 FROM products
  WHERE id = 'gpu-rtx-5080'
  FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM products WHERE id = 'gpu-rtx-5080'
      AND name = 'GeForce RTX 5080 그래픽카드' AND category = 'GPU'
  ) THEN
    RAISE EXCEPTION 'Expected demo product missing or changed; inspect before proceeding';
  END IF;
  IF EXISTS (
    SELECT 1 FROM product_source_mappings
    WHERE product_id = 'gpu-rtx-5080'
      AND (source <> 'DANAWA' OR external_product_id <> '9503733')
  ) THEN
    RAISE EXCEPTION 'Product mapping has changed; inspect before proceeding';
  END IF;
END $$;

INSERT INTO product_source_mapping_quarantine
  (product_id, source, external_product_id, original_row, reason)
SELECT m.product_id, m.source, m.external_product_id, to_jsonb(m),
  'DEMO_MAPPING_MISMATCH_20261019: RTX 5080 demo mapped to Danawa 9503733 (food product)'
FROM product_source_mappings m
WHERE m.product_id = 'gpu-rtx-5080'
  AND m.source = 'DANAWA' AND m.external_product_id = '9503733'
ON CONFLICT (product_id, source, external_product_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM product_source_mapping_quarantine
    WHERE product_id = 'gpu-rtx-5080' AND source = 'DANAWA'
      AND external_product_id = '9503733'
  ) THEN
    RAISE EXCEPTION 'No incorrect mapping or archived mapping found; aborting';
  END IF;
END $$;

INSERT INTO price_history_exclusions AS e
  (price_history_id, observed_price, reason)
SELECT h.id, h.price,
  'DEMO_MAPPING_MISMATCH_20261019: not RTX 5080 history; incorrect Danawa 9503733 mapping'
FROM price_histories h
WHERE h.product_id = 'gpu-rtx-5080'
ON CONFLICT (price_history_id, observed_price) DO UPDATE
SET reason = EXCLUDED.reason, reviewed_at = now(), revoked_at = NULL
WHERE e.revoked_at IS NOT NULL;

DELETE FROM product_source_mappings
WHERE product_id = 'gpu-rtx-5080'
  AND source = 'DANAWA' AND external_product_id = '9503733';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM price_histories_for_analysis WHERE product_id = 'gpu-rtx-5080'
  ) THEN
    RAISE EXCEPTION 'Quarantine verification failed; rolling back';
  END IF;
END $$;
COMMIT;

-- Expected using the supplied DB results: 23, 0, 0, 1.
SELECT
  (SELECT count(*) FROM public.price_histories
    WHERE product_id = 'gpu-rtx-5080') AS preserved_raw_prices,
  (SELECT count(*) FROM public.price_histories_for_analysis
    WHERE product_id = 'gpu-rtx-5080') AS usable_prices,
  (SELECT count(*) FROM public.product_source_mappings
    WHERE product_id = 'gpu-rtx-5080') AS active_mappings,
  (SELECT count(*) FROM public.product_source_mapping_quarantine
    WHERE product_id = 'gpu-rtx-5080' AND source = 'DANAWA'
      AND external_product_id = '9503733') AS archived_mappings;
