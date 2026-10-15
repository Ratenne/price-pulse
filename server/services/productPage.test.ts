import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { readProductPage, parseProductQuery } from "./productPage";
import {
  readLivePrices,
  readSelectedLivePrices,
} from "../integrations/danawa/danawaLivePrices";
vi.mock("../integrations/danawa/danawaLivePrices", () => ({
  readLivePrices: vi.fn(),
  readSelectedLivePrices: vi.fn(),
}));
const now = new Date("2026-10-15T00:00:00Z");
const row = {
  id: "danawa-1",
  name: "GPU 1",
  category: "GPU",
  source_url: "https://prod.danawa.com/info/?pcode=1",
  external_product_id: "1",
  low: 100,
  high: 200,
  average: 150,
  previous: 120,
  latest_month: "2026-09",
  updated_at: now.toISOString(),
};
const summary = { category: "GPU", product_count: "689", average_range: 100 };
beforeEach(() => vi.clearAllMocks());
describe("page-scoped product queries", () => {
  it("validates category, bounded pagination, and live ID limits", () => {
    expect(
      parseProductQuery("/?view=rankings&page=2&category=GPU")
    ).toMatchObject({ page: 2, category: "GPU" });
    for (const query of [
      "page=0",
      "category=GPU%27",
      "sort=invalid",
      "view=detail",
      "view=live&ids=" + Array(21).fill("danawa-1").join(","),
    ])
      expect(() => parseProductQuery("/?" + query)).toThrow("INVALID_QUERY");
  });
  it("returns home summaries immediately without a live lookup and reads history for only one featured product", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [summary] })
      .mockResolvedValueOnce({ rows: [{ count: "689" }] })
      .mockResolvedValueOnce({
        rows: [row, { ...row, id: "danawa-2", external_product_id: "2" }],
      })
      .mockResolvedValueOnce({ rows: [{ date: "2026-09", price: 120 }] });
    const result = await readProductPage(
      { query } as unknown as Pool,
      parseProductQuery("/?view=home"),
      now
    );
    expect(
      "products" in result && result.products.map(p => p.priceHistory.length)
    ).toEqual([1, 0]);
    expect(query.mock.calls[2][1]).toEqual([
      "2026-04-01",
      "2026-10-01",
      null,
      "",
      10,
      0,
    ]);
    expect(query.mock.calls[3][1][0]).toBe("danawa-1");
    expect(readLivePrices).not.toHaveBeenCalled();
    expect(readSelectedLivePrices).not.toHaveBeenCalled();
  });
  it("paginates before returning any history arrays", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [summary] })
      .mockResolvedValueOnce({ rows: [{ count: "689" }] })
      .mockResolvedValueOnce({ rows: [row] });
    const result = await readProductPage(
      { query } as unknown as Pool,
      parseProductQuery("/?view=rankings&page=2"),
      now
    );
    expect("products" in result && result.products[0].priceHistory).toEqual([]);
    expect(query.mock.calls[2][1].slice(-2)).toEqual([10, 10]);
    expect(query).toHaveBeenCalledTimes(3);
    for (const [sql] of query.mock.calls)
      expect(sql).toContain("JOIN price_histories_for_analysis");
  });
  it("omits reviewed values from chart data but returns the excluded months for gap labels", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [summary] })
      .mockResolvedValueOnce({ rows: [{ ...row, low: 1383060 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { date: "2026-07", price: 1825960, exclusion_reason: null },
          { date: "2026-08", price: 1, exclusion_reason: "ISOLATED_LOW" },
          { date: "2026-09", price: 2760680, exclusion_reason: null },
        ],
      });
    const result = await readProductPage(
      { query } as unknown as Pool,
      parseProductQuery("/?view=detail&id=danawa-1"),
      now
    );
    expect("products" in result && result.products[0]).toMatchObject({
      priceHistory: [
        { date: "2026-07", price: 1825960 },
        { date: "2026-09", price: 2760680 },
      ],
      excludedHistoryMonths: ["2026-08"],
    });
    expect(query.mock.calls[3][0]).toContain("FROM reviewed_price_histories");
    expect(JSON.stringify(result)).not.toContain("ISOLATED_LOW");
  });
  it("queries current prices for only requested product IDs", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    vi.mocked(readSelectedLivePrices).mockResolvedValue({
      prices: new Map([["1", 125]]),
      checkedAt: now.toISOString(),
    });
    const result = await readProductPage(
      { query } as unknown as Pool,
      parseProductQuery("/?view=live&ids=danawa-1"),
      now
    );
    expect(result).toEqual({
      prices: [{ id: "danawa-1", price: 125, checkedAt: now.toISOString() }],
    });
    expect(query.mock.calls[0][1]).toEqual([["danawa-1"]]);
    expect(readLivePrices).not.toHaveBeenCalled();
  });
  it("uses live prices for a globally correct price sort but returns only a bounded page", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      ...row,
      id: `danawa-${i + 1}`,
      external_product_id: String(i + 1),
    }));
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [summary] })
      .mockResolvedValueOnce({ rows });
    vi.mocked(readLivePrices).mockResolvedValue({
      prices: new Map(rows.map((r, i) => [r.external_product_id, 120 - i])),
      checkedAt: now.toISOString(),
    });
    const result = await readProductPage(
      { query } as unknown as Pool,
      parseProductQuery("/?view=rankings&sort=price-asc&page=2"),
      now
    );
    expect(
      "products" in result && result.products.map(p => p.currentPrice)
    ).toEqual([119, 120]);
    expect("total" in result && result.total).toBe(12);
  });
});
