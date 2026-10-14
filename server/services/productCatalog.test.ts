import { describe, it, expect } from "vitest";
import { toCatalogProduct, type CatalogRow } from "./productCatalog";

const row: CatalogRow = {
  id: "danawa-123",
  name: "실제 GPU 상품",
  category: "PC 주요 부품_그래픽카드",
  current_price: "1200",
  updated_at: "2026-08-20T00:00:00Z",
  source_url: "https://prod.danawa.com/info/?pcode=123",
  external_product_id: "123",
  history: [
    { date: "2025-12", price: 9999 },
    { date: "2026-03", price: 1000 },
    { date: "2026-07", price: 1500 },
    { date: "2026-08", price: 1200 },
  ],
};
const now = new Date("2026-09-14T00:00:00Z");
const live = { prices: new Map([["123", 1200]]), checkedAt: now.toISOString() };

describe("database product catalog", () => {
  it("uses six completed months relative to query date without interpolation", () => {
    const product = toCatalogProduct(row, live, now)!;
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
  it("does not use a stored or historical price as a live price", () => {
    expect(toCatalogProduct(row, undefined, now)?.currentPrice).toBeNull();
    expect(toCatalogProduct(row, undefined, now)?.priceStatus).toBe("UNKNOWN");
  });
  it("excludes current and future monthly aggregates while keeping live price separate", () => {
    const product = toCatalogProduct(
      {
        ...row,
        history: [
          ...row.history,
          { date: "2026-09", price: 10 },
          { date: "2026-10", price: 20 },
        ],
      },
      live,
      now
    )!;
    expect(product.priceHistory.at(-1)?.date).toBe("2026-08");
    expect(product.currentPrice).toBe(1200);
    expect(product.currentPriceMonth).toBe("2026-09");
    expect(product.currentPriceCheckedAt).toBe(live.checkedAt);
  });
  it("omits unknown categories and products without history", () => {
    expect(toCatalogProduct({ ...row, category: "UNKNOWN" })).toBeUndefined();
    expect(toCatalogProduct({ ...row, history: [] })).toBeUndefined();
  });
});
