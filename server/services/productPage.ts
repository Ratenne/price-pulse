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
import {
  readLivePrices,
  readSelectedLivePrices,
} from "../integrations/danawa/danawaLivePrices.js";

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
}
// Aggregate the requested six-month window in PostgreSQL. Lists never materialize full history arrays.
const STATS = `WITH stats AS (
 SELECT p.id, p.name, CASE WHEN p.category IN ('GPU','PC 주요 부품_그래픽카드') THEN 'GPU' ELSE p.category END AS category,
 m.source_url,m.external_product_id,min(h.price)::float8 AS low,max(h.price)::float8 AS high,
 round(avg(h.price))::float8 AS average,(array_agg(h.price ORDER BY h.price_year_month DESC))[1]::float8 AS previous,
 to_char(max(h.price_year_month),'YYYY-MM') AS latest_month,greatest(p.updated_at,max(h.updated_at))::text AS updated_at
 FROM products p JOIN product_source_mappings m ON m.product_id=p.id AND m.source='DANAWA'
 JOIN price_histories_for_analysis h ON h.product_id=p.id AND h.source='DANAWA'
 WHERE m.source_url LIKE 'https://prod.danawa.com/info/%' AND h.price>0 AND h.granularity='MONTH'
 AND h.source_type='HISTORICAL_IMPORT' AND h.price_year_month >= $1::date AND h.price_year_month < $2::date
 AND p.category IN ('GPU','PC 주요 부품_그래픽카드','CPU','LAPTOP')
 GROUP BY p.id,m.source_url,m.external_product_id
)`;

function toProduct(row: SummaryRow, currentMonth: string): Product {
  const range = row.high - row.low;
  return {
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
    priceStatus: "LOADING",
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
  };
}

export async function readProductPage(
  pool: Pool,
  query: ProductQuery,
  now = new Date(),
  signal?: AbortSignal
): Promise<ProductPage | LivePricePage> {
  const window = completedPriceWindow(now);
  const dates = [`${window.fromMonth}-01`, `${window.currentMonth}-01`];
  if (query.view === "live") {
    const rows = await pool.query<{
      id: string;
      name: string;
      external_product_id: string;
    }>(
      `SELECT p.id,p.name,m.external_product_id FROM products p JOIN product_source_mappings m ON m.product_id=p.id AND m.source='DANAWA' WHERE p.id=ANY($1::text[]) AND m.source_url LIKE 'https://prod.danawa.com/info/%'`,
      [query.ids]
    );
    const live = await readSelectedLivePrices(rows.rows, undefined, signal);
    return {
      prices: rows.rows.map(row => ({
        id: row.id,
        price: live.prices.get(row.external_product_id) ?? null,
        checkedAt: live.checkedAt,
      })),
    };
  }
  const summaryRows = await pool.query<{
    category: ProductCategory;
    product_count: string;
    average_range: number;
  }>(
    `${STATS} SELECT category,count(*)::text AS product_count,avg((high-low)/low*100)::float8 AS average_range FROM stats GROUP BY category`,
    dates
  );
  const summaries: CatalogSummary[] = summaryRows.rows.map(row => ({
    category: row.category,
    productCount: Number(row.product_count),
    averageRangeRate: row.average_range,
    nearLowestCount: null,
  }));
  const filter = `WHERE ($3::text IS NULL OR category=$3) AND position(lower($4) in lower(name))>0`;
  const params = [...dates, query.category ?? null, query.q];
  const size =
    query.view === "near-low"
      ? 3
      : query.view === "detail" || query.view === "guide"
        ? 1
        : 10;
  let rows: SummaryRow[];
  let total: number;
  let page = query.page;
  const needsGlobalLive =
    query.view === "near-low" ||
    (query.view === "rankings" && query.sort !== "range");
  if (needsGlobalLive) {
    const all = await pool.query<SummaryRow>(
      `${STATS} SELECT * FROM stats ${filter}`,
      params
    );
    const live = await readLivePrices();
    let products = all.rows.map(row =>
      applyCurrentPrice(
        toProduct(row, window.currentMonth),
        live.prices.get(row.external_product_id) ?? null,
        live.checkedAt
      )
    );
    for (const summary of summaries)
      summary.nearLowestCount = products.filter(
        p =>
          p.category === summary.category &&
          p.currentPrice !== null &&
          p.currentPrice <= p.sixMonthLowPrice * 1.1
      ).length;
    if (query.view === "near-low")
      products = products.filter(
        p =>
          p.currentPrice !== null && p.currentPrice <= p.sixMonthLowPrice * 1.1
      );
    products.sort((a, b) => {
      if (a.currentPrice === null && b.currentPrice === null)
        return a.id.localeCompare(b.id);
      if (a.currentPrice === null) return 1;
      if (b.currentPrice === null) return -1;
      return query.sort === "price-asc"
        ? a.currentPrice - b.currentPrice
        : query.sort === "price-desc"
          ? b.currentPrice - a.currentPrice
          : a.lowestPriceDifferenceRate - b.lowestPriceDifferenceRate ||
            a.id.localeCompare(b.id);
    });
    total = products.length;
    page = Math.max(1, Math.min(page, Math.ceil(total / size)));
    return {
      products: products.slice((page - 1) * size, page * size),
      total,
      page,
      pageSize: size,
      summaries,
    };
  }
  if (query.view === "detail") {
    const result = await pool.query<SummaryRow>(
      `${STATS} SELECT * FROM stats WHERE id=$3`,
      [...dates, query.id]
    );
    rows = result.rows;
    total = rows.length;
    page = 1;
    if (rows[0]) {
      const related = await pool.query<SummaryRow>(
        `${STATS} SELECT * FROM stats WHERE category=$3 AND id<>$4 ORDER BY abs(average-$5),id LIMIT 3`,
        [...dates, rows[0].category, rows[0].id, rows[0].average]
      );
      rows.push(...related.rows);
    }
  } else {
    const count = await pool.query<{ count: string }>(
      `${STATS} SELECT count(*)::text AS count FROM stats ${filter}`,
      params
    );
    total = Number(count.rows[0].count);
    page = Math.max(1, Math.min(page, Math.ceil(total / size)));
    const result = await pool.query<SummaryRow>(
      `${STATS} SELECT * FROM stats ${filter} ORDER BY (high-low)/low DESC,(high-low) DESC,id LIMIT $5 OFFSET $6`,
      [...params, size, (page - 1) * size]
    );
    rows = result.rows;
  }
  const products = rows.map(row => toProduct(row, window.currentMonth));
  if ((query.view === "home" || query.view === "detail") && products[0]) {
    const history = await pool.query<{
      date: string;
      price: number;
      exclusion_reason: string | null;
    }>(
      `SELECT to_char(price_year_month,'YYYY-MM') AS date,price::float8 AS price,exclusion_reason FROM reviewed_price_histories WHERE product_id=$1 AND source='DANAWA' AND granularity='MONTH' AND source_type='HISTORICAL_IMPORT' AND price_year_month >= $2::date AND price_year_month < $3::date ORDER BY price_year_month`,
      [products[0].id, ...dates]
    );
    products[0].priceHistory = history.rows
      .filter(point => !point.exclusion_reason)
      .map(({ date, price }) => ({ date, price }));
    products[0].excludedHistoryMonths = history.rows
      .filter(point => !!point.exclusion_reason)
      .map(point => point.date);
  }
  return { products, total, page, pageSize: size, summaries };
}
