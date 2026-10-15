import type { Pool } from "pg";
import type { Product } from "../../client/src/domain/product";
import {
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from "../../client/src/domain/category.js";
import { completedPriceWindow } from "../domain/priceCalendar.js";
import {
  readLivePrices,
  type LivePrices,
} from "../integrations/danawa/danawaLivePrices.js";

export interface CatalogRow {
  id: string;
  name: string;
  category: string;
  current_price: string | null;
  updated_at: string;
  source_url: string;
  external_product_id?: string;
  history: { date: string; price: number }[];
}

export function toCatalogProduct(
  row: CatalogRow,
  live?: LivePrices,
  now = new Date()
): Product | undefined {
  const category: ProductCategory | undefined =
    row.category === "PC 주요 부품_그래픽카드" || row.category === "GPU"
      ? "GPU"
      : row.category === "CPU"
        ? "CPU"
        : row.category === "LAPTOP"
          ? "LAPTOP"
          : undefined;
  if (!category || !row.history.length) return undefined;
  const { currentMonth, fromMonth } = completedPriceWindow(now);
  const history = row.history
    .filter(point => point.date < currentMonth)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!history.length) return undefined;
  const latest = history.at(-1)!;
  const priceHistory = history.filter(point => point.date >= fromMonth);
  if (!priceHistory.length) return undefined;
  const values = priceHistory.map(point => point.price);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const current = live?.prices.get(row.external_product_id ?? "") ?? null;
  const previous = latest.price;
  const range = high - low;
  const position =
    current !== null && range
      ? Math.max(0, Math.min(100, ((current - low) / range) * 100))
      : 50;
  const change = current === null ? 0 : current - previous;
  const changeRate = (change / previous) * 100;
  return {
    id: row.id,
    category,
    manufacturer: "",
    modelName: row.name,
    displayName: row.name,
    imageUrl: PRODUCT_CATEGORIES[category].imageUrl,
    tags: ["다나와 월별 최저가"],
    currentPrice: current,
    previousPrice: previous,
    changeAmount: change,
    changeRate,
    recentTrend:
      changeRate >= 1 ? "RISING" : changeRate <= -1 ? "FALLING" : "STABLE",
    sixMonthLowPrice: low,
    sixMonthHighPrice: high,
    sixMonthAveragePrice: Math.round(
      values.reduce((sum, value) => sum + value, 0) / values.length
    ),
    priceRangeAmount: range,
    priceRangeRate: (range / low) * 100,
    currentPositionRate: position,
    lowestPriceDifferenceRate:
      current === null ? 0 : ((current - low) / low) * 100,
    fairPriceMin: Math.round((low + range * 0.28) / 1000) * 1000,
    fairPriceMax: Math.round((low + range * 0.58) / 1000) * 1000,
    priceStatus:
      current === null
        ? "UNKNOWN"
        : position <= 10
          ? "VERY_LOW"
          : position <= 30
            ? "LOW"
            : position <= 65
              ? "FAIR"
              : position <= 85
                ? "HIGH"
                : "VERY_HIGH",
    priceHistory,
    updatedAt: row.updated_at,
    sourceUrl: row.source_url,
    latestHistoryMonth: latest.date,
    currentPriceCheckedAt: live?.checkedAt,
    currentPriceMonth: currentMonth,
  };
}

export async function readProductCatalog(
  pool: Pool,
  now = new Date()
): Promise<Product[]> {
  const [result, live] = await Promise.all([
    pool.query<CatalogRow>(`
    SELECT p.id, p.name, p.category, p.current_price::text,
           greatest(p.updated_at, max(h.updated_at))::text AS updated_at,
           m.source_url, m.external_product_id,
           json_agg(json_build_object('date', to_char(h.price_year_month, 'YYYY-MM'),
                                     'price', h.price) ORDER BY h.price_year_month) AS history
      FROM products p
      JOIN product_source_mappings m ON m.product_id = p.id AND m.source = 'DANAWA'
      JOIN price_histories_for_analysis h ON h.product_id = p.id AND h.source = 'DANAWA'
     WHERE m.source_url LIKE 'https://prod.danawa.com/info/%'
       AND h.granularity = 'MONTH' AND h.source_type = 'HISTORICAL_IMPORT' AND h.price > 0
     GROUP BY p.id, m.source_url, m.external_product_id
     ORDER BY p.id
  `),
    readLivePrices().catch(error => {
      console.warn(
        JSON.stringify({
          message: "Danawa live price lookup failed",
          exceptionType: error instanceof Error ? error.name : typeof error,
        })
      );
      return undefined;
    }),
  ]);
  return result.rows
    .map(row => toCatalogProduct(row, live, now))
    .filter((product): product is Product => !!product);
}
