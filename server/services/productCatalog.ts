import type { Pool } from "pg";
import type { Product } from "../../client/src/domain/product";
import {
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from "../../client/src/domain/category";

export interface CatalogRow {
  id: string;
  name: string;
  category: string;
  current_price: string | null;
  updated_at: string;
  source_url: string;
  history: { date: string; price: number }[];
}

export function toCatalogProduct(row: CatalogRow): Product | undefined {
  const category: ProductCategory | undefined =
    row.category === "PC 주요 부품_그래픽카드" || row.category === "GPU"
      ? "GPU"
      : row.category === "CPU"
        ? "CPU"
        : row.category === "LAPTOP"
          ? "LAPTOP"
          : undefined;
  if (!category || !row.history.length) return undefined;
  const history = [...row.history].sort((a, b) => a.date.localeCompare(b.date));
  const latest = history.at(-1)!;
  const [year, month] = latest.date.split("-").map(Number);
  const cutoff = new Date(Date.UTC(year, month - 6, 1))
    .toISOString()
    .slice(0, 7);
  const priceHistory = history.filter(point => point.date >= cutoff);
  const values = priceHistory.map(point => point.price);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const current = row.current_price ? Number(row.current_price) : latest.price;
  const previous = history.at(-2)?.price ?? latest.price;
  const range = high - low;
  const position = range
    ? Math.max(0, Math.min(100, ((current - low) / range) * 100))
    : 50;
  const change = current - previous;
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
    lowestPriceDifferenceRate: ((current - low) / low) * 100,
    fairPriceMin: Math.round((low + range * 0.28) / 1000) * 1000,
    fairPriceMax: Math.round((low + range * 0.58) / 1000) * 1000,
    priceStatus:
      position <= 10
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
  };
}

export async function readProductCatalog(pool: Pool): Promise<Product[]> {
  const result = await pool.query<CatalogRow>(`
    SELECT p.id, p.name, p.category, p.current_price::text,
           p.updated_at::text, m.source_url,
           json_agg(json_build_object('date', to_char(h.price_year_month, 'YYYY-MM'),
                                     'price', h.price) ORDER BY h.price_year_month) AS history
      FROM products p
      JOIN product_source_mappings m ON m.product_id = p.id AND m.source = 'DANAWA'
      JOIN price_histories h ON h.product_id = p.id AND h.source = 'DANAWA'
     WHERE m.source_url LIKE 'https://prod.danawa.com/info/%'
       AND h.granularity = 'MONTH' AND h.source_type = 'HISTORICAL_IMPORT' AND h.price > 0
     GROUP BY p.id, m.source_url
     ORDER BY p.id
  `);
  return result.rows
    .map(toCatalogProduct)
    .filter((product): product is Product => !!product);
}
