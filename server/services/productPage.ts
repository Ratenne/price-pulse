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
  };
}

// A snapshot older than this is treated as unknown instead of shown as "current".
// The refresh job runs every 3 hours, so this tolerates several missed runs.
const LIVE_PRICE_MAX_AGE_HOURS = 12;
const FRESH_SNAPSHOT = `p.current_price_checked_at > now() - interval '${LIVE_PRICE_MAX_AGE_HOURS} hours'`;
const NEAR_LOW = "current_price IS NOT NULL AND current_price <= low * 1.1";

interface SummaryRow {
  id: string;
  name: string;
  category: ProductCategory;
  source_url: string;
  external_product_id: string;
  low: number;
  high: number;
  average: number;
  previous: number;
  latest_month: string;
  updated_at: string;
  current_price: number | null;
  current_price_checked_at: string | null;
}
// Aggregate the requested six-month window in PostgreSQL. Lists never materialize full history arrays.
// current_price comes from the scheduled snapshot (products.current_price), never from a live request.
const STATS = `WITH stats AS (
 SELECT p.id, p.name, CASE WHEN p.category IN ('GPU','PC 주요 부품_그래픽카드') THEN 'GPU' ELSE p.category END AS category,
 m.source_url,m.external_product_id,min(h.price)::float8 AS low,max(h.price)::float8 AS high,
 round(avg(h.price))::float8 AS average,(array_agg(h.price ORDER BY h.price_year_month DESC))[1]::float8 AS previous,
 to_char(max(h.price_year_month),'YYYY-MM') AS latest_month,greatest(p.updated_at,max(h.updated_at))::text AS updated_at,
 CASE WHEN ${FRESH_SNAPSHOT} THEN p.current_price::float8 END AS current_price,
 to_char(p.current_price_checked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS current_price_checked_at
 FROM products p JOIN product_source_mappings m ON m.product_id=p.id AND m.source='DANAWA'
 JOIN price_histories_for_analysis h ON h.product_id=p.id AND h.source='DANAWA'
 WHERE m.source_url LIKE 'https://prod.danawa.com/info/%' AND h.price>0 AND h.granularity='MONTH'
 AND h.source_type='HISTORICAL_IMPORT' AND h.price_year_month >= $1::date AND h.price_year_month < $2::date
 AND p.category IN ('GPU','PC 주요 부품_그래픽카드','CPU','LAPTOP')
 GROUP BY p.id,m.source_url,m.external_product_id
)`;

// Only these fixed fragments are ever interpolated; query.sort is validated in parseProductQuery.
const ORDER_BY: Record<ProductQuery["sort"], string> = {
  range: "(high-low)/low DESC,(high-low) DESC,id",
  "price-asc": "current_price ASC NULLS LAST,id",
  "price-desc": "current_price DESC NULLS LAST,id",
  "near-low": "(current_price-low)/low ASC NULLS LAST,id",
};

function toProduct(row: SummaryRow, currentMonth: string): Product {
  const range = row.high - row.low;
  return applyCurrentPrice(
    {
      id: row.id,
      category: row.category,
      manufacturer: "",
      modelName: row.name,
      displayName: row.name,
      imageUrl: PRODUCT_CATEGORIES[row.category].imageUrl,
      tags: ["다나와 월별 최저가"],
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
      priceRangeRate: (range / row.low) * 100,
      currentPositionRate: 50,
      lowestPriceDifferenceRate: 0,
      fairPriceMin: Math.round((row.low + range * 0.28) / 1000) * 1000,
      fairPriceMax: Math.round((row.low + range * 0.58) / 1000) * 1000,
      priceHistory: [],
      updatedAt: row.updated_at,
      sourceUrl: row.source_url,
      latestHistoryMonth: row.latest_month,
      currentPriceMonth: currentMonth,
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
    average_range: number;
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
  const filter = `WHERE ($3::text IS NULL OR category=$3) AND position(lower($4) in lower(name))>0${nearLowOnly ? ` AND ${NEAR_LOW}` : ""}`;
  const order =
    ORDER_BY[nearLowOnly && query.sort === "range" ? "near-low" : query.sort];
  const params = [...dates, query.category ?? null, query.q];
  const fetchPage = (page: number) =>
    pool.query<SummaryRow & { total_count: string }>(
      `${STATS} SELECT *,count(*) OVER()::text AS total_count FROM stats ${filter} ORDER BY ${order} LIMIT $5 OFFSET $6`,
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
}
function readHistory(pool: Pool, productId: string, dates: string[]) {
  return pool.query<HistoryRow>(
    `SELECT to_char(price_year_month,'YYYY-MM') AS date,price::float8 AS price,exclusion_reason FROM reviewed_price_histories WHERE product_id=$1 AND source='DANAWA' AND granularity='MONTH' AND source_type='HISTORICAL_IMPORT' AND price_year_month >= $2::date AND price_year_month < $3::date ORDER BY price_year_month`,
    [productId, ...dates]
  );
}
function applyHistory(product: Product, history: HistoryRow[]) {
  product.priceHistory = history
    .filter(point => !point.exclusion_reason)
    .map(({ date, price }) => ({ date, price }));
  product.excludedHistoryMonths = history
    .filter(point => !!point.exclusion_reason)
    .map(point => point.date);
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
  }>(
    `SELECT p.id,CASE WHEN ${FRESH_SNAPSHOT} THEN p.current_price::float8 END AS price,
     to_char(p.current_price_checked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS checked_at
     FROM products p JOIN product_source_mappings m ON m.product_id=p.id AND m.source='DANAWA'
     WHERE p.id=ANY($1::text[]) AND m.source_url LIKE 'https://prod.danawa.com/info/%'`,
    [ids]
  );
  return {
    prices: result.rows.map(row => ({
      id: row.id,
      price: row.price,
      checkedAt: row.checked_at ?? now.toISOString(),
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
  const dates = [`${window.fromMonth}-01`, `${window.currentMonth}-01`];

  if (query.view === "detail") {
    const [summaries, found, history] = await Promise.all([
      readSummaries(pool, dates),
      pool.query<SummaryRow>(`${STATS} SELECT * FROM stats WHERE id=$3`, [
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
        `${STATS} SELECT * FROM stats WHERE category=$3 AND id<>$4 ORDER BY abs(average-$5),id LIMIT 3`,
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
