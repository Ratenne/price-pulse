import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { readProductPage, parseProductQuery } from "./productPage";

const now = new Date("2026-10-15T00:00:00Z");
const checkedAt = "2026-10-14T21:00:00Z";
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
  current_price: 105,
  current_price_checked_at: checkedAt,
  total_count: "689",
  valid_count: 6,
  monthly_count: 6,
  first_month: "2026-04",
  last_month: "2026-09",
  first_observed_at: null,
  last_observed_at: null,
  ranking_period: "SIX_MONTHS",
  data_status: "NORMAL",
};
const summary = {
  category: "GPU",
  product_count: "689",
  average_range: 100,
  near_lowest_count: "12",
};
function pool(query: ReturnType<typeof vi.fn>) {
  return { query } as unknown as Pool;
}
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
      "period=invalid",
      "view=detail",
      "view=live&ids=" + Array(21).fill("danawa-1").join(","),
    ])
      expect(() => parseProductQuery("/?" + query)).toThrow("INVALID_QUERY");
  });
  it("returns home with stored current prices in one round and reads history for only one featured product", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [summary] })
      .mockResolvedValueOnce({
        rows: [
          row,
          {
            ...row,
            id: "danawa-2",
            external_product_id: "2",
            current_price: null,
            current_price_checked_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ date: "2026-09", price: 120 }] });
    const result = await readProductPage(
      pool(query),
      parseProductQuery("/?view=home"),
      now
    );
    if (!("products" in result)) throw new Error("expected a product page");
    expect(result.products.map(p => p.priceHistory.length)).toEqual([1, 0]);
    expect(result.products.map(p => p.currentPrice)).toEqual([105, null]);
    expect(result.products.map(p => p.priceStatus)).toEqual([
      "VERY_LOW",
      "UNKNOWN",
    ]);
    expect(result.products[0].currentPriceCheckedAt).toBe(checkedAt);
    expect(result.summaries[0].nearLowestCount).toBe(12);
    expect(result.total).toBe(689);
    expect(query.mock.calls[1][1]).toEqual([
      "2026-04-01",
      "2026-10-01",
      now.toISOString(),
      null,
      "",
      10,
      0,
    ]);
    expect(query.mock.calls[2][1][3]).toBe("danawa-1");
    expect(query).toHaveBeenCalledTimes(3);
  });
  it("paginates before returning any history arrays and needs no separate count query", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [summary] })
      .mockResolvedValueOnce({ rows: [row] });
    const result = await readProductPage(
      pool(query),
      parseProductQuery("/?view=rankings&page=2"),
      now
    );
    expect("products" in result && result.products[0].priceHistory).toEqual([]);
    expect(query.mock.calls[1][1].slice(-2)).toEqual([10, 10]);
    expect(query.mock.calls[1][0]).toContain("count(*) OVER()");
    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql] of query.mock.calls)
      expect(sql).toContain("FROM price_histories_for_analysis");
  });
  it("falls back to the last page when the requested page is past the end", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [summary] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "25" }] })
      .mockResolvedValueOnce({ rows: [{ ...row, total_count: "25" }] });
    const result = await readProductPage(
      pool(query),
      parseProductQuery("/?view=rankings&page=99"),
      now
    );
    expect(result).toMatchObject({ page: 3, total: 25, pageSize: 10 });
    expect(query.mock.calls[3][1].slice(-2)).toEqual([10, 20]);
  });
  it("omits reviewed values from chart data but returns the excluded months for gap labels", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [summary] })
      .mockResolvedValueOnce({ rows: [{ ...row, low: 1383060 }] })
      .mockResolvedValueOnce({
        rows: [
          { date: "2026-07", price: 1825960, exclusion_reason: null },
          { date: "2026-08", price: 1, exclusion_reason: "ISOLATED_LOW" },
          { date: "2026-09", price: 2760680, exclusion_reason: null },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const result = await readProductPage(
      pool(query),
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
    expect(query.mock.calls[2][0]).toContain("FROM reviewed_price_histories");
    expect(JSON.stringify(result)).not.toContain("ISOLATED_LOW");
  });
  it("reads requested current prices from the stored snapshot without calling Danawa", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { id: "danawa-1", price: 125, checked_at: checkedAt },
        { id: "danawa-2", price: null, checked_at: null },
      ],
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await readProductPage(
      pool(query),
      parseProductQuery("/?view=live&ids=danawa-1,danawa-2"),
      now
    );
    expect(result).toEqual({
      prices: [
        { id: "danawa-1", price: 125, checkedAt },
        { id: "danawa-2", price: null, checkedAt: now.toISOString() },
      ],
    });
    expect(query.mock.calls[0][1]).toEqual([["danawa-1", "danawa-2"]]);
    expect(query.mock.calls[0][0]).toContain("interval '12 hours'");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("sorts by stored price in SQL and returns only a bounded page", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [summary] })
      .mockResolvedValueOnce({
        rows: [
          { ...row, id: "danawa-11", current_price: 119, total_count: "12" },
          { ...row, id: "danawa-12", current_price: 120, total_count: "12" },
        ],
      });
    const result = await readProductPage(
      pool(query),
      parseProductQuery("/?view=rankings&sort=price-asc&page=2"),
      now
    );
    expect(
      "products" in result && result.products.map(p => p.currentPrice)
    ).toEqual([119, 120]);
    expect("total" in result && result.total).toBe(12);
    expect(query.mock.calls[1][0]).toContain(
      "ORDER BY current_price ASC NULLS LAST,id"
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("selects the near-low view in SQL with a page of three", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [summary] })
      .mockResolvedValueOnce({ rows: [{ ...row, total_count: "1" }] });
    const result = await readProductPage(
      pool(query),
      parseProductQuery("/?view=near-low"),
      now
    );
    expect(result).toMatchObject({ pageSize: 3, total: 1 });
    expect(query.mock.calls[1][0]).toContain("current_price <= low * 1.1");
    expect(query.mock.calls[1][0]).toContain(
      "ORDER BY (current_price-low)/low ASC NULLS LAST,id"
    );
    expect(query.mock.calls[1][1].slice(-2)).toEqual([3, 0]);
  });
  it("reports an unknown near-low count when no category price is fresh", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ ...summary, near_lowest_count: null }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const result = await readProductPage(
      pool(query),
      parseProductQuery("/?view=home"),
      now
    );
    expect("summaries" in result && result.summaries[0].nearLowestCount).toBe(
      null
    );
  });
});
