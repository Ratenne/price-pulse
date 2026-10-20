-- Apply after 001-004. Does not require or activate the pc_* schema in 005.
-- No existing prices, timestamps, products or monthly histories are rewritten.
BEGIN;

CREATE TABLE IF NOT EXISTS price_observations (
  product_id text NOT NULL REFERENCES products(id),
  source text NOT NULL CHECK (source = 'DANAWA'),
  observed_at timestamptz NOT NULL,
  item_price bigint NOT NULL CHECK (item_price > 0 AND item_price <= 9007199254740991),
  -- NULL means unprovided, never free shipping.
  shipping_fee bigint CHECK (shipping_fee >= 0 AND shipping_fee <= 9007199254740991),
  event_type text NOT NULL CHECK (event_type IN ('FIRST_OBSERVATION','OBSERVATION_BASELINE','PRICE_CHANGE')),
  last_observed_at timestamptz NOT NULL,
  observation_count bigint NOT NULL DEFAULT 1 CHECK (observation_count > 0),
  CHECK (last_observed_at >= observed_at),
  PRIMARY KEY (product_id, source, observed_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS price_observations_first_uk
  ON price_observations(product_id, source) WHERE event_type = 'FIRST_OBSERVATION';

-- Append-only checks are per collection stream: a successful current observation cannot
-- conceal a historical collection error (or turn absent history into an error).
CREATE TABLE IF NOT EXISTS price_collection_status (
  product_id text NOT NULL REFERENCES products(id),
  source text NOT NULL CHECK (source = 'DANAWA'),
  stream text NOT NULL CHECK (stream IN ('CURRENT','HISTORY')),
  status text NOT NULL CHECK (status IN ('NORMAL','INSUFFICIENT_HISTORY','NO_SOURCE_DATA','COLLECTION_FAILED')),
  reason text NOT NULL,
  checked_at timestamptz NOT NULL,
  PRIMARY KEY (product_id, source, stream, checked_at)
);
CREATE OR REPLACE VIEW latest_price_collection_status AS
SELECT DISTINCT ON (product_id,source,stream) * FROM price_collection_status
ORDER BY product_id,source,stream,checked_at DESC;

-- Includes products with only reviewed/excluded monthly rows. Does not infer
-- a historical observation date from created_at or current_price_checked_at.
CREATE OR REPLACE VIEW products_without_price_history AS
SELECT p.id AS product_id, p.name, m.external_product_id
FROM products p JOIN product_source_mappings m ON m.product_id = p.id AND m.source = 'DANAWA'
WHERE NOT EXISTS (
  SELECT 1 FROM price_histories_for_analysis h WHERE h.product_id = p.id AND h.price > 0
) AND NOT EXISTS (
  SELECT 1 FROM price_observations o WHERE o.product_id = p.id AND o.item_price > 0
);

ALTER TABLE price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_collection_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON price_observations, price_collection_status, latest_price_collection_status, products_without_price_history FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON price_observations, price_collection_status, latest_price_collection_status, products_without_price_history FROM %I',r);
    END IF;
  END LOOP;
END $$;
COMMIT;
