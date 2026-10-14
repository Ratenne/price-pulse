BEGIN;

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_source_mappings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source text NOT NULL,
  external_product_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_source_mappings_product_source_uk
    UNIQUE (product_id, source),
  CONSTRAINT product_source_mappings_source_external_uk
    UNIQUE (source, external_product_id),
  CONSTRAINT product_source_mappings_source_ck
    CHECK (source IN ('DANAWA')),
  CONSTRAINT product_source_mappings_external_id_ck
    CHECK (length(trim(external_product_id)) > 0)
);

CREATE INDEX IF NOT EXISTS product_source_mappings_product_idx
  ON product_source_mappings (product_id);

CREATE TABLE IF NOT EXISTS price_histories (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source text NOT NULL,
  price bigint NOT NULL,
  price_year_month date NOT NULL,
  granularity text NOT NULL,
  source_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_histories_identity_uk
    UNIQUE (product_id, source, price_year_month, granularity),
  CONSTRAINT price_histories_price_ck CHECK (price > 0),
  CONSTRAINT price_histories_month_ck
    CHECK (price_year_month = date_trunc('month', price_year_month)::date),
  CONSTRAINT price_histories_source_ck CHECK (source IN ('DANAWA')),
  CONSTRAINT price_histories_granularity_ck CHECK (granularity IN ('MONTH')),
  CONSTRAINT price_histories_source_type_ck
    CHECK (source_type IN ('HISTORICAL_IMPORT'))
);

CREATE INDEX IF NOT EXISTS price_histories_product_month_idx
  ON price_histories (product_id, price_year_month DESC);

COMMIT;
