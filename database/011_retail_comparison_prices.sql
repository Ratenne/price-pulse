-- Apply after 010. No price/fee/time backfill: old observations remain intact.
BEGIN;
ALTER TABLE retail_price_observations ADD COLUMN IF NOT EXISTS displayed_price bigint;
ALTER TABLE retail_current_offers ADD COLUMN IF NOT EXISTS displayed_price bigint;
ALTER TABLE retail_price_observations DROP CONSTRAINT IF EXISTS retail_observation_displayed_price_ck;
ALTER TABLE retail_price_observations ADD CONSTRAINT retail_observation_displayed_price_ck
  CHECK (displayed_price IS NULL OR displayed_price BETWEEN 1 AND 2000000000);
ALTER TABLE retail_current_offers DROP CONSTRAINT IF EXISTS retail_current_displayed_price_ck;
ALTER TABLE retail_current_offers ADD CONSTRAINT retail_current_displayed_price_ck
  CHECK (displayed_price IS NULL OR displayed_price BETWEEN 1 AND 2000000000);
ALTER TABLE retail_price_observations DROP CONSTRAINT IF EXISTS retail_observation_availability_ck;
ALTER TABLE retail_price_observations ADD CONSTRAINT retail_observation_availability_ck
  CHECK (availability IN ('IN_STOCK','OUT_OF_STOCK') AND
    (availability='OUT_OF_STOCK' OR (item_price IS NOT NULL AND
      (shipping_fee IS NOT NULL OR displayed_price IS NOT NULL))));
ALTER TABLE retail_current_offers DROP CONSTRAINT IF EXISTS retail_current_availability_ck;
ALTER TABLE retail_current_offers ADD CONSTRAINT retail_current_availability_ck
  CHECK (availability IN ('IN_STOCK','OUT_OF_STOCK') AND
    (availability='OUT_OF_STOCK' OR (item_price IS NOT NULL AND
      (shipping_fee IS NOT NULL OR displayed_price IS NOT NULL))));

-- Keep retail-first/Danawa-reference priority, freshness and per-source rules.
-- price remains the backward-compatible comparison price for sorting/clients.
CREATE OR REPLACE VIEW product_current_prices AS
WITH offers AS (
  SELECT l.product_id,l.source,l.url,
    CASE WHEN c.shipping_fee IS NOT NULL THEN c.item_price+c.shipping_fee ELSE c.displayed_price END AS price,
    c.shipping_fee,c.observed_at AS checked_at,c.item_price,c.displayed_price
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
  SELECT p.id,'DANAWA',m.source_url,p.current_price,NULL::bigint,p.current_price_checked_at,
    p.current_price,p.current_price,1
  FROM products p JOIN product_source_mappings m ON m.product_id=p.id AND m.source='DANAWA'
  WHERE p.current_price>0 AND p.current_price_checked_at>now()-interval '12 hours'
    AND p.current_price_checked_at<=now() AND m.source_url LIKE 'https://prod.danawa.com/info/%'
), grouped AS (
  SELECT product_id,jsonb_agg(jsonb_build_object(
    'source',source,'url',url,'price',price::float8,'comparisonPrice',price::float8,
    'shippingFee',shipping_fee::float8,'shippingFeeKnown',shipping_fee IS NOT NULL,
    'itemPrice',item_price::float8,'displayedPrice',displayed_price::float8,
    'comparisonBasis',CASE WHEN shipping_fee IS NOT NULL THEN 'SHIPPING_INCLUDED' ELSE 'DISPLAYED_PRICE' END,
    'checkedAt',to_char(checked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    ORDER BY priority,price,source) AS offers FROM candidates GROUP BY product_id
), best AS (
  SELECT DISTINCT ON (product_id) * FROM candidates ORDER BY product_id,priority,price,checked_at DESC,source
)
SELECT b.product_id,b.price,b.checked_at,b.source,b.url,g.offers,
  b.shipping_fee,b.shipping_fee IS NOT NULL AS shipping_fee_known,
  CASE WHEN b.shipping_fee IS NOT NULL THEN 'SHIPPING_INCLUDED' ELSE 'DISPLAYED_PRICE' END AS comparison_basis,
  b.displayed_price,b.item_price,b.price AS comparison_price
FROM best b JOIN grouped g USING(product_id);
COMMIT;
