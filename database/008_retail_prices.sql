-- Apply after 001-004. Independent of the unused, broader pc_* design in 005.
-- 007 is a separate data-quality migration and is not a prerequisite.
BEGIN;
CREATE TABLE IF NOT EXISTS retail_product_links (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  source text NOT NULL CHECK (source IN ('COUPANG','11ST','GMARKET','AUCTION','NAVER')),
  url text NOT NULL,
  listing_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  verified_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz,
  last_error text,
  UNIQUE(source,url)
);
CREATE INDEX IF NOT EXISTS retail_links_due_idx ON retail_product_links(last_attempt_at NULLS FIRST,id) WHERE enabled;
CREATE INDEX IF NOT EXISTS retail_links_product_idx ON retail_product_links(product_id) WHERE enabled;
CREATE TABLE IF NOT EXISTS retail_price_observations (
  listing_id integer NOT NULL REFERENCES retail_product_links(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  item_price bigint NOT NULL CHECK (item_price BETWEEN 1 AND 2000000000),
  shipping_fee bigint NOT NULL CHECK (shipping_fee BETWEEN 0 AND 2000000000),
  method text NOT NULL CHECK (method IN ('CRAWL','IMPORT')),
  link_version integer NOT NULL,
  CHECK (item_price + shipping_fee <= 2000000000),
  PRIMARY KEY(listing_id,observed_at)
);
CREATE INDEX IF NOT EXISTS retail_observations_date_idx ON retail_price_observations(observed_at);
CREATE TABLE IF NOT EXISTS retail_current_offers (
  listing_id integer PRIMARY KEY REFERENCES retail_product_links(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  item_price bigint NOT NULL CHECK (item_price BETWEEN 1 AND 2000000000),
  shipping_fee bigint NOT NULL CHECK (shipping_fee BETWEEN 0 AND 2000000000),
  link_version integer NOT NULL,
  CHECK (item_price + shipping_fee <= 2000000000)
);

-- All totals in this view are verified, ordinary KR domestic-delivery prices.
-- Danawa has no shipping amount in the existing collector: only a fallback reference.
CREATE OR REPLACE VIEW product_current_prices AS
WITH offers AS (
  SELECT l.product_id,l.source,l.url,c.item_price+c.shipping_fee AS price,c.shipping_fee,c.observed_at AS checked_at
  FROM retail_product_links l JOIN retail_current_offers c ON c.listing_id=l.id
  JOIN products p ON p.id=l.product_id AND p.name=l.product_name
  WHERE l.enabled AND c.link_version=l.version
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

-- Server-only objects, consistent with the existing private collection tables.
REVOKE ALL ON retail_product_links,retail_price_observations,retail_current_offers,product_current_prices FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON retail_product_links,retail_price_observations,retail_current_offers,product_current_prices FROM %I',r);
    END IF;
  END LOOP;
END $$;
COMMIT;
