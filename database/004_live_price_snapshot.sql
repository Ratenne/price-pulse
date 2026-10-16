BEGIN;

-- Current Danawa lowest price is captured by a scheduled job
-- (server/scripts/refreshLivePrices.ts) and served from this table, so a page
-- request never has to wait on Danawa. products.current_price already exists
-- (002); this adds the time the value was last confirmed against Danawa.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS current_price_checked_at timestamptz;

-- Supports price sorting and "near the 6-month low" filtering without a scan.
CREATE INDEX IF NOT EXISTS products_category_current_price_idx
  ON products (category, current_price)
  WHERE current_price IS NOT NULL;

COMMIT;
