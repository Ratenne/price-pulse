import { describe, it, expect } from "vitest";
import { toCatalogProduct, type CatalogRow } from "./productCatalog";

const row: CatalogRow = {
  id: "danawa-123",
  name: "실제 GPU 상품",
  category: "PC 주요 부품_그래픽카드",
  current_price: "1200",
  updated_at: "2026-08-20T00:00:00Z",
  source_url: "https://prod.danawa.com/info/?pcode=123",
  history: [
    { date: "2025-12", price: 9999 },
    { date: "2026-03", price: 1000 },
    { date: "2026-07", price: 1500 },
    { date: "2026-08", price: 1200 },
  ],
};

describe("database product catalog", () => {
  it("uses six calendar months ending at the latest observed month without interpolation", () => {
    const product = toCatalogProduct(row)!;
    expect(product.priceHistory.map(p => p.date)).toEqual([
      "2026-03",
      "2026-07",
      "2026-08",
    ]);
    expect(product.category).toBe("GPU");
    expect(product.sixMonthLowPrice).toBe(1000);
    expect(product.sixMonthHighPrice).toBe(1500);
    expect(product.currentPositionRate).toBe(40);
    expect(product.sourceUrl).toBe(row.source_url);
  });
  it("falls back to the actual latest historical price when no snapshot price exists", () => {
    expect(
      toCatalogProduct({ ...row, current_price: null })?.currentPrice
    ).toBe(1200);
  });
  it("omits unknown categories and products without history", () => {
    expect(toCatalogProduct({ ...row, category: "UNKNOWN" })).toBeUndefined();
    expect(toCatalogProduct({ ...row, history: [] })).toBeUndefined();
  });
});
