import type { Pool } from "pg";
import type { Product } from "../../client/src/domain/product";
import {
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from "../../client/src/domain/category.js";
import { completedPriceWindow } from "../domain/priceCalendar.js";
import {
  applyCurrentPrice,
  type ProductPage,
  type CatalogSummary,
  type LivePricePage,
} from "../../shared/productPage.js";

export interface ProductQuery {
  view:
    | "home"
    | "rankings"
    | "category"
    | "detail"
    | "near-low"
    | "live"
    | "guide";
  category?: ProductCategory;
  sort: "range" | "price-asc" | "price-desc" | "near-low";
  page: number;
  q: string;
  id?: string;
  ids: string[];
  period: "six-months" | "under-six-months" | "all";
}
export function parseProductQuery(url: string): ProductQuery {
  const p = new URL(url, "http://localhost").searchParams;
  const view = p.get("view") ?? "home";
  const category = p.get("category") || undefined;
  const sort = p.get("sort") ?? "range";
  const page = Number(p.get("page") ?? 1);
  const q = p.get("q") ?? "";
  const id = p.get("id") ?? undefined;
  const ids = p.get("ids")?.split(",").filter(Boolean) ?? [];
  const period =
    p.get("period") ??
    (view === "home" || (view === "rankings" && sort === "range")
      ? "six-months"
      : "all");
  if (
    ![
      "home",
      "rankings",
      "category",
      "detail",
      "near-low",
      "live",
      "guide",
    ].includes(view) ||
    !["range", "price-asc", "price-desc", "near-low"].includes(sort) ||
    !["six-months", "under-six-months", "all"].includes(period) ||
    (category && !Object.hasOwn(PRODUCT_CATEGORIES, category)) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000 ||
    q.length > 100 ||
    (view === "detail" && !id) ||
    ids.length > 20 ||
    [...ids, ...(id ? [id] : [])].some(value => !/^[\w-]{1,80}$/.test(value))
  )
    throw new Error("INVALID_QUERY");
  return {
    view: view as ProductQuery["view"],
    category: category as ProductCategory | undefined,
    sort: sort as ProductQuery["sort"],
    page,
    q,
    id,
    ids,
    period: period as ProductQuery["period"],
  };
}

// A snapshot older than this is treated as unknown instead of shown as "current".
// The refresh job runs every 3 hours, so this tolerates several missed runs.
const LIVE_PRICE_MAX_AGE_HOURS = 12;
const FRESH_SNAPSHOT = `cp.checked_at > now() - interval '${LIVE_PRICE_MAX_AGE_HOURS} hours'`;
const NEAR_LOW = "current_price IS NOT NULL AND current_price <= low * 1.1";

interface SummaryRow {
  id: string;
  name: string;
  category: ProductCategory;
  source_url: string | null;
  external_product_id: string | null;
  low: number | null;
  high: number | null;
  average: number | null;
  previous: number | null;
  latest_month: string | null;
  updated_at: string;
  current_price: number | null;
  current_price_checked_at: string | null;
  current_price_source?: Product["currentPriceSource"];
  current_price_url?: string;
  current_price_shipping_fee_known?: boolean;
  current_price_comparison_basis?: Product["currentPriceComparisonBasis"];
  current_price_shipping_fee?: number | null;
  current_price_displayed_price?: number | null;
  current_price_item_price?: number | null;
  offers?: Product["offers"];
  valid_count: number;
  monthly_count: number;
  first_month: string | null;
  last_month: string | null;
  first_observed_at: string | null;
  last_observed_at: string | null;
  first_analysis_observed_at: string | null;
  last_analysis_observed_at: string | null;
  ranking_period: NonNullable<Product["analysis"]>["rankingPeriod"];
  data_status: NonNullable<Product["analysis"]>["dataStatus"];
}
// Aggregate the requested six-month window in PostgreSQL. Lists never materialize full history arrays.
// Current offers are collected by batches. The view chooses eligible stored
// retail comparison prices, with the existing Danawa reference fallback.
const STATS = `WITH monthly AS (
 SELECT h.product_id,h.price_year_month,h.price,h.updated_at
 FROM price_histories_for_analysis h
 WHERE h.source='DANAWA' AND h.price>0 AND h.granularity='MONTH' AND h.source_type='HISTORICAL_IMPORT'
 AND h.price_year_month >= $1::date AND h.price_year_month < $2::date
), monthly_coverage AS (
 SELECT product_id,count(*)::int AS monthly_count,to_char(min(price_year_month),'YYYY-MM') AS first_month,
 to_char(max(price_year_month),'YYYY-MM') AS last_month FROM monthly GROUP BY product_id
), observed AS (
 SELECT o.product_id,c.checked_at AS observed_at,o.item_price AS price FROM price_observations o
 JOIN price_collection_status c ON c.product_id=o.product_id AND c.source=o.source AND c.stream='CURRENT' AND c.status='NORMAL'
 AND c.checked_at BETWEEN o.observed_at AND o.last_observed_at
 WHERE c.checked_at <= $3::timestamptz
 UNION
 SELECT product_id,observed_at,item_price FROM price_observations WHERE observed_at <= $3::timestamptz
 UNION
 SELECT product_id,last_observed_at,item_price FROM price_observations WHERE last_observed_at <= $3::timestamptz
), observation_coverage AS (
 SELECT product_id,min(observed_at) AS first_observed_at,max(observed_at) AS last_observed_at FROM observed GROUP BY product_id
), points AS (
 SELECT product_id,price,to_char(price_year_month,'YYYY-MM') AS point_key,updated_at,NULL::timestamptz AS observed_at FROM monthly
 UNION ALL
 SELECT o.product_id,o.price,to_char(o.observed_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI:SS.US'),o.observed_at,o.observed_at
 FROM observed o LEFT JOIN monthly_coverage mc USING(product_id)
 WHERE coalesce(mc.monthly_count,0)<6
 AND o.observed_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Seoul')
 AND NOT EXISTS (SELECT 1 FROM monthly m WHERE m.product_id=o.product_id
   AND to_char(m.price_year_month,'YYYY-MM')=to_char(o.observed_at AT TIME ZONE 'Asia/Seoul','YYYY-MM'))
), aggregate_prices AS (
 SELECT product_id,count(*)::int AS valid_count,
 CASE WHEN count(*)>=2 THEN min(price)::float8 END AS low,
 CASE WHEN count(*)>=2 THEN max(price)::float8 END AS high,
 CASE WHEN count(*)>=2 THEN round(avg(price))::float8 END AS average,
 (array_agg(price ORDER BY point_key DESC))[1]::float8 AS previous,max(updated_at) AS updated_at,
 min(observed_at) AS first_analysis_observed_at,max(observed_at) AS last_analysis_observed_at
 FROM points GROUP BY product_id
), stats AS (
 SELECT p.id, p.name, CASE WHEN p.category IN ('GPU','PC 주요 부품_그래픽카드') THEN 'GPU' ELSE p.category END AS category,
 m.source_url,m.external_product_id,a.low,a.high,a.average,a.previous,mc.last_month AS latest_month,
 greatest(p.updated_at,a.updated_at)::text AS updated_at,
 coalesce(a.valid_count,0) AS valid_count,coalesce(mc.monthly_count,0) AS monthly_count,mc.first_month,mc.last_month,
 to_char(oc.first_observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS first_observed_at,
 to_char(oc.last_observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_observed_at,
 to_char(a.first_analysis_observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS first_analysis_observed_at,
 to_char(a.last_analysis_observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_analysis_observed_at,
 CASE WHEN coalesce(a.valid_count,0)<2 THEN 'INSUFFICIENT'
 WHEN mc.monthly_count=6 OR oc.last_observed_at >= ((oc.first_observed_at AT TIME ZONE 'Asia/Seoul')+interval '6 months') AT TIME ZONE 'Asia/Seoul'
 THEN 'SIX_MONTHS' ELSE 'UNDER_SIX_MONTHS' END AS ranking_period,
 CASE WHEN cs.status='COLLECTION_FAILED' OR hs.status='COLLECTION_FAILED' THEN 'COLLECTION_FAILED'
 WHEN hs.status='NO_SOURCE_DATA' THEN 'NO_SOURCE_DATA'
 WHEN coalesce(a.valid_count,0)<2 OR hs.status='INSUFFICIENT_HISTORY' THEN 'INSUFFICIENT_HISTORY' ELSE 'NORMAL' END AS data_status,
 CASE WHEN ${FRESH_SNAPSHOT} THEN cp.price::float8 END AS current_price,
 to_char(cp.checked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS current_price_checked_at,
 cp.source AS current_price_source,cp.url AS current_price_url,cp.offers,
 cp.shipping_fee_known AS current_price_shipping_fee_known,cp.comparison_basis AS current_price_comparison_basis,
 cp.shipping_fee::float8 AS current_price_shipping_fee,cp.displayed_price::float8 AS current_price_displayed_price,
 cp.item_price::float8 AS current_price_item_price
 FROM products p LEFT JOIN product_source_mappings m ON m.product_id=p.id AND m.source='DANAWA'
 LEFT JOIN product_current_prices cp ON cp.product_id=p.id
 LEFT JOIN aggregate_prices a ON a.product_id=p.id
 LEFT JOIN monthly_coverage mc ON mc.product_id=p.id
 LEFT JOIN observation_coverage oc ON oc.product_id=p.id
 LEFT JOIN LATERAL (SELECT status FROM price_collection_status WHERE product_id=p.id AND source='DANAWA' AND stream='CURRENT' AND checked_at<=$3::timestamptz ORDER BY checked_at DESC LIMIT 1) cs ON true
 LEFT JOIN LATERAL (SELECT status FROM price_collection_status WHERE product_id=p.id AND source='DANAWA' AND stream='HISTORY' AND checked_at<=$3::timestamptz ORDER BY checked_at DESC LIMIT 1) hs ON true
 WHERE (m.source_url LIKE 'https://prod.danawa.com/info/%' OR m.product_id IS NULL)
 AND p.category IN ('GPU','PC 주요 부품_그래픽카드','CPU','LAPTOP')
)`;

// Only these fixed fragments are ever interpolated; query.sort is validated in parseProductQuery.
const ORDER_BY: Record<ProductQuery["sort"], string> = {
  range: "(high-low)/low DESC NULLS LAST,(high-low) DESC NULLS LAST,id",
  "price-asc": "current_price ASC NULLS LAST,id",
  "price-desc": "current_price DESC NULLS LAST,id",
  "near-low": "(current_price-low)/low ASC NULLS LAST,id",
};

function toProduct(row: SummaryRow, currentMonth: string): Product {
  const comparable =
    row.low !== null && row.high !== null && row.average !== null;
  const range = comparable ? row.high! - row.low! : null;
  return applyCurrentPrice(
    {
      id: row.id,
      category: row.category,
      manufacturer: "",
      modelName: row.name,
      displayName: row.name,
      imageUrl: PRODUCT_CATEGORIES[row.category].imageUrl,
      tags: [
        row.external_product_id ? "다나와 월별 최저가" : "판매처 실관측 가격",
      ],
      currentPrice: null,
      previousPrice: row.previous,
      changeAmount: 0,
      changeRate: 0,
      recentTrend: "STABLE",
      priceStatus: "UNKNOWN",
      sixMonthLowPrice: row.low,
      sixMonthHighPrice: row.high,
      sixMonthAveragePrice: row.average,
      priceRangeAmount: range,
      priceRangeRate: comparable ? (range! / row.low!) * 100 : null,
      currentPositionRate: 50,
      lowestPriceDifferenceRate: 0,
      fairPriceMin: comparable
        ? Math.round((row.low! + range! * 0.28) / 1000) * 1000
        : null,
      fairPriceMax: comparable
        ? Math.round((row.low! + range! * 0.58) / 1000) * 1000
        : null,
      priceHistory: [],
      updatedAt: row.updated_at,
      sourceUrl: row.source_url ?? undefined,
      latestHistoryMonth: row.latest_month ?? undefined,
      currentPriceMonth: currentMonth,
      currentPriceSource: row.current_price_source,
      currentPriceUrl: row.current_price_url,
      currentPriceShippingFeeKnown:
        row.current_price_shipping_fee_known ?? undefined,
      currentPriceComparisonBasis:
        row.current_price_comparison_basis ?? undefined,
      currentPriceShippingFee: row.current_price_shipping_fee,
      currentPriceDisplayedPrice: row.current_price_displayed_price,
      currentPriceItemPrice: row.current_price_item_price,
      offers: row.offers ?? [],
      analysis: {
        comparable,
        observationCount: row.valid_count,
        monthlyCount: row.monthly_count,
        firstHistoryMonth: row.first_month,
        lastHistoryMonth: row.last_month,
        firstObservedAt: row.first_analysis_observed_at ?? null,
        lastObservedAt: row.last_analysis_observed_at ?? null,
        coverageFirstObservedAt: row.first_observed_at,
        coverageLastObservedAt: row.last_observed_at,
        rankingPeriod: row.ranking_period,
        dataStatus: row.data_status,
      },
    },
    row.current_price,
    row.current_price_checked_at ?? undefined
  );
}

async function readSummaries(
  pool: Pool,
  dates: string[]
): Promise<CatalogSummary[]> {
  const result = await pool.query<{
    category: ProductCategory;
    product_count: string;
    average_range: number | null;
    near_lowest_count: string | null;
  }>(
    `${STATS} SELECT category,count(*)::text AS product_count,avg((high-low)/low*100)::float8 AS average_range,
     CASE WHEN count(current_price)=0 THEN NULL ELSE (count(*) FILTER (WHERE ${NEAR_LOW}))::text END AS near_lowest_count
     FROM stats GROUP BY category`,
    dates
  );
  return result.rows.map(row => ({
    category: row.category,
    productCount: Number(row.product_count),
    averageRangeRate: row.average_range,
    nearLowestCount:
      row.near_lowest_count === null ? null : Number(row.near_lowest_count),
  }));
}

// Sorting, filtering and paging all happen in PostgreSQL against the stored
// snapshot, so a price sort or the near-low view costs the same as any list.
async function readList(
  pool: Pool,
  query: ProductQuery,
  dates: string[]
): Promise<{ rows: SummaryRow[]; total: number; page: number; size: number }> {
  const nearLowOnly = query.view === "near-low";
  const size = nearLowOnly ? 3 : query.view === "guide" ? 1 : 10;
  const period =
    query.view === "home"
      ? "SIX_MONTHS"
      : query.period === "six-months"
        ? "SIX_MONTHS"
        : query.period === "under-six-months"
          ? "UNDER_SIX_MONTHS"
          : null;
  const rankingOnly =
    query.view === "home" ||
    (query.view === "rankings" && query.period !== "all");
  const filter = `WHERE ($4::text IS NULL OR category=$4) AND position(lower($5) in lower(name))>0${nearLowOnly ? ` AND ${NEAR_LOW}` : ""}${rankingOnly ? " AND valid_count>=2" : ""}${period ? ` AND ranking_period='${period}'` : ""}`;
  const order =
    ORDER_BY[nearLowOnly && query.sort === "range" ? "near-low" : query.sort];
  const params = [...dates, query.category ?? null, query.q];
  const fetchPage = (page: number) =>
    pool.query<SummaryRow & { total_count: string }>(
      `${STATS} SELECT *,count(*) OVER()::text AS total_count FROM stats ${filter} ORDER BY ${order} LIMIT $6 OFFSET $7`,
      [...params, size, (page - 1) * size]
    );
  let page = query.page;
  let result = await fetchPage(page);
  let total = Number(result.rows[0]?.total_count ?? 0);
  if (!result.rows.length && page > 1) {
    // Requested page is past the end: fall back to the last page.
    const count = await pool.query<{ count: string }>(
      `${STATS} SELECT count(*)::text AS count FROM stats ${filter}`,
      params
    );
    total = Number(count.rows[0].count);
    page = Math.max(1, Math.ceil(total / size));
    if (total) result = await fetchPage(page);
  }
  return { rows: result.rows, total, page, size };
}

interface HistoryRow {
  date: string;
  price: number;
  exclusion_reason: string | null;
  kind?: "MONTH" | "OBSERVATION";
}
function readHistory(pool: Pool, productId: string, dates: string[]) {
  return pool.query<HistoryRow>(
    `${STATS} SELECT to_char(price_year_month,'YYYY-MM') AS date,price::float8 AS price,exclusion_reason,'MONTH' AS kind FROM reviewed_price_histories
     WHERE product_id=$4 AND source='DANAWA' AND granularity='MONTH' AND source_type='HISTORICAL_IMPORT' AND price_year_month >= $1::date AND price_year_month < $2::date
     UNION ALL SELECT point_key||'+09:00' AS date,price::float8,NULL,'OBSERVATION' FROM points WHERE product_id=$4 AND observed_at IS NOT NULL ORDER BY date`,
    [...dates, productId]
  );
}
function applyHistory(product: Product, history: HistoryRow[]) {
  product.priceHistory = history
    .filter(point => !point.exclusion_reason && point.kind !== "OBSERVATION")
    .map(({ date, price }) => ({ date, price }));
  product.excludedHistoryMonths = history
    .filter(point => !!point.exclusion_reason)
    .map(point => point.date);
  product.observedPriceHistory = history
    .filter(point => point.kind === "OBSERVATION")
    .map(({ date, price }) => ({ date, price }));
}

// Current prices for the given products, straight from the stored snapshot.
async function readSnapshotPrices(
  pool: Pool,
  ids: string[],
  now: Date
): Promise<LivePricePage> {
  const result = await pool.query<{
    id: string;
    price: number | null;
    checked_at: string | null;
    source?: Product["currentPriceSource"];
    url?: string;
    shipping_fee_known?: boolean;
    comparison_basis?: Product["currentPriceComparisonBasis"];
    shipping_fee?: number | null;
    displayed_price?: number | null;
    item_price?: number | null;
  }>(
    `SELECT p.id,CASE WHEN ${FRESH_SNAPSHOT} THEN cp.price::float8 END AS price,
     to_char(cp.checked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS checked_at,
     cp.source,cp.url,cp.shipping_fee_known,cp.comparison_basis,
     cp.shipping_fee::float8 AS shipping_fee,cp.displayed_price::float8 AS displayed_price,cp.item_price::float8 AS item_price
     FROM products p LEFT JOIN product_source_mappings m ON m.product_id=p.id AND m.source='DANAWA'
     LEFT JOIN product_current_prices cp ON cp.product_id=p.id
     WHERE p.id=ANY($1::text[]) AND (m.source_url LIKE 'https://prod.danawa.com/info/%' OR m.product_id IS NULL)`,
    [ids]
  );
  return {
    prices: result.rows.map(row => ({
      id: row.id,
      price: row.price,
      checkedAt: row.checked_at ?? now.toISOString(),
      ...(row.source
        ? {
            source: row.source,
            url: row.url,
            shippingFeeKnown: row.shipping_fee_known,
            comparisonBasis: row.comparison_basis,
            shippingFee: row.shipping_fee,
            displayedPrice: row.displayed_price,
            itemPrice: row.item_price,
          }
        : {}),
    })),
  };
}

export async function readProductPage(
  pool: Pool,
  query: ProductQuery,
  now = new Date(),
  signal?: AbortSignal
): Promise<ProductPage | LivePricePage> {
  if (query.view === "live") return readSnapshotPrices(pool, query.ids, now);
  const window = completedPriceWindow(now);
  const dates = [
    `${window.fromMonth}-01`,
    `${window.currentMonth}-01`,
    now.toISOString(),
  ];

  if (query.view === "detail") {
    const [summaries, found, history] = await Promise.all([
      readSummaries(pool, dates),
      pool.query<SummaryRow>(`${STATS} SELECT * FROM stats WHERE id=$4`, [
        ...dates,
        query.id,
      ]),
      readHistory(pool, query.id!, dates),
    ]);
    signal?.throwIfAborted();
    const rows = found.rows;
    const total = rows.length;
    if (rows[0]) {
      const related = await pool.query<SummaryRow>(
        `${STATS} SELECT * FROM stats WHERE category=$4 AND id<>$5 ORDER BY abs(average-$6) NULLS LAST,id LIMIT 3`,
        [...dates, rows[0].category, rows[0].id, rows[0].average]
      );
      rows.push(...related.rows);
    }
    const products = rows.map(row => toProduct(row, window.currentMonth));
    if (products[0]) applyHistory(products[0], history.rows);
    return { products, total, page: 1, pageSize: 1, summaries };
  }

  const [summaries, list] = await Promise.all([
    readSummaries(pool, dates),
    readList(pool, query, dates),
  ]);
  signal?.throwIfAborted();
  const products = list.rows.map(row => toProduct(row, window.currentMonth));
  if (query.view === "home" && products[0]) {
    const history = await readHistory(pool, products[0].id, dates);
    applyHistory(products[0], history.rows);
  }
  return {
    products,
    total: list.total,
    page: list.page,
    pageSize: list.size,
    summaries,
  };
}
