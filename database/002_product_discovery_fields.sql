BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS current_price bigint,
  ADD COLUMN IF NOT EXISTS registered_year_month date;

ALTER TABLE product_source_mappings
  ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_current_price_ck;

ALTER TABLE products
  ADD CONSTRAINT products_current_price_ck
    CHECK (current_price IS NULL OR current_price > 0);

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_registered_month_ck;

ALTER TABLE products
  ADD CONSTRAINT products_registered_month_ck
    CHECK (
      registered_year_month IS NULL
      OR registered_year_month = date_trunc('month', registered_year_month)::date
    );

COMMIT;
