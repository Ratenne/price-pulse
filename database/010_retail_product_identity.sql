-- Apply after 001-004,008,009. Does not depend on or activate 005/pc_*.
-- All legacy prices, product IDs and monthly histories are preserved.
BEGIN;
CREATE TABLE IF NOT EXISTS retail_product_identities (
  product_id text PRIMARY KEY REFERENCES products(id),
  identity_key text NOT NULL UNIQUE CHECK (identity_key ~ '^[a-f0-9]{64}$'),
  identity jsonb NOT NULL CHECK (jsonb_typeof(identity)='object'),
  required_option_keys text[] NOT NULL CHECK (cardinality(required_option_keys)>0),
  reviewed_by text NOT NULL CHECK (length(btrim(reviewed_by))>0),
  reviewed_at timestamptz NOT NULL,
  evidence text NOT NULL CHECK (length(btrim(evidence))>0)
);
-- A shared MPN/GTIN with the same exact variant must not be inserted twice
-- merely because a provider changed the model's marketing spelling.
CREATE UNIQUE INDEX IF NOT EXISTS retail_identity_mpn_variant_uk ON retail_product_identities
  ((identity->>'manufacturer'),(identity->>'mpn'),(identity->'variants'),(identity->>'distributor'),(identity->>'warranty'))
  WHERE identity->>'mpn' IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS retail_identity_gtin_variant_uk ON retail_product_identities
  ((identity->>'gtin'),(identity->'variants'),(identity->>'distributor'),(identity->>'warranty'))
  WHERE identity->>'gtin' IS NOT NULL;
ALTER TABLE retail_product_links ADD COLUMN IF NOT EXISTS external_product_id text;
ALTER TABLE retail_product_links DROP CONSTRAINT IF EXISTS retail_links_external_id_ck;
ALTER TABLE retail_product_links ADD CONSTRAINT retail_links_external_id_ck
  CHECK (external_product_id IS NULL OR length(btrim(external_product_id))>0);
CREATE UNIQUE INDEX IF NOT EXISTS retail_links_source_external_uk
  ON retail_product_links(source,external_product_id) WHERE external_product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS retail_product_review_queue (
  source text NOT NULL CHECK (source IN ('COUPANG','11ST','GMARKET','AUCTION','NAVER')),
  external_product_id text NOT NULL CHECK (length(btrim(external_product_id))>0),
  title text NOT NULL,
  candidate_product_ids text[] NOT NULL DEFAULT '{}',
  reason text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  PRIMARY KEY (source,external_product_id)
);
ALTER TABLE retail_price_observations ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'IN_STOCK';
ALTER TABLE retail_current_offers ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'IN_STOCK';
ALTER TABLE retail_price_observations ADD COLUMN IF NOT EXISTS data_source text;
ALTER TABLE retail_price_observations ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE retail_price_observations ALTER COLUMN item_price DROP NOT NULL;
ALTER TABLE retail_price_observations ALTER COLUMN shipping_fee DROP NOT NULL;
ALTER TABLE retail_current_offers ALTER COLUMN item_price DROP NOT NULL;
ALTER TABLE retail_current_offers ALTER COLUMN shipping_fee DROP NOT NULL;
ALTER TABLE retail_price_observations DROP CONSTRAINT IF EXISTS retail_price_observations_method_check;
ALTER TABLE retail_price_observations ADD CONSTRAINT retail_price_observations_method_check
  CHECK (method IN ('CRAWL','IMPORT','API'));
ALTER TABLE retail_price_observations DROP CONSTRAINT IF EXISTS retail_observation_availability_ck;
ALTER TABLE retail_price_observations ADD CONSTRAINT retail_observation_availability_ck
  CHECK (availability IN ('IN_STOCK','OUT_OF_STOCK') AND
    (availability='OUT_OF_STOCK' OR (item_price IS NOT NULL AND shipping_fee IS NOT NULL)));
ALTER TABLE retail_current_offers DROP CONSTRAINT IF EXISTS retail_current_availability_ck;
ALTER TABLE retail_current_offers ADD CONSTRAINT retail_current_availability_ck
  CHECK (availability IN ('IN_STOCK','OUT_OF_STOCK') AND
    (availability='OUT_OF_STOCK' OR (item_price IS NOT NULL AND shipping_fee IS NOT NULL)));

CREATE OR REPLACE VIEW product_current_prices AS
WITH offers AS (
  SELECT l.product_id,l.source,l.url,c.item_price+c.shipping_fee AS price,c.shipping_fee,c.observed_at AS checked_at
  FROM retail_product_links l JOIN retail_current_offers c ON c.listing_id=l.id
  JOIN products p ON p.id=l.product_id AND p.name=l.product_name
  WHERE l.enabled AND c.link_version=l.version AND c.availability='IN_STOCK'
    AND c.observed_at > now()-interval '12 hours' AND c.observed_at <= now()
), per_source AS (
  SELECT DISTINCT ON (product_id,source) * FROM offers
  ORDER BY product_id,source,price,checked_at DESC,url
), candidates AS (
  SELECT *,0 AS priority FROM per_source
  UNION ALL
  SELECT p.id,'DANAWA',m.source_url,p.current_price,NULL::bigint,p.current_price_checked_at,1
  FROM products p JOIN product_source_mappings m ON m.product_id=p.id AND m.source='DANAWA'
  WHERE p.current_price>0 AND p.current_price_checked_at>now()-interval '12 hours'
    AND p.current_price_checked_at<=now() AND m.source_url LIKE 'https://prod.danawa.com/info/%'
), grouped AS (
  SELECT product_id,jsonb_agg(jsonb_build_object(
    'source',source,'url',url,'price',price::float8,'shippingFee',shipping_fee::float8,
    'checkedAt',to_char(checked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    ORDER BY priority,price,source) AS offers FROM candidates GROUP BY product_id
), best AS (
  SELECT DISTINCT ON (product_id) * FROM candidates ORDER BY product_id,priority,price,checked_at DESC,source
)
SELECT b.product_id,b.price,b.checked_at,b.source,b.url,g.offers
FROM best b JOIN grouped g USING(product_id);


ALTER TABLE retail_product_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_product_review_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON retail_product_identities,retail_product_review_queue FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON retail_product_identities,retail_product_review_queue FROM %I',r);
    END IF;
  END LOOP;
END $$;
COMMIT;
