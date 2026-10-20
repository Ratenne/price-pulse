import { describe, expect, it } from "vitest";
import { hasPriceAnalysis, formatObservationPeriod } from "./priceAnalysis";
import { applyCurrentPrice } from "./productPage";
import {
  sortProducts,
  getTopPriceRangeProducts,
} from "../client/src/services/productService";
import mockProducts from "../client/src/data/mockProducts";
import type { Product } from "../client/src/domain/product";

const metadata: NonNullable<Product["analysis"]> = {
  comparable: true,
  observationCount: 2,
  monthlyCount: 2,
  firstHistoryMonth: "2026-08",
  lastHistoryMonth: "2026-09",
  firstObservedAt: null,
  lastObservedAt: null,
  coverageFirstObservedAt: null,
  coverageLastObservedAt: null,
  rankingPeriod: "UNDER_SIX_MONTHS",
  dataStatus: "INSUFFICIENT_HISTORY",
};
describe("price analysis guards and ranking", () => {
  it("keeps unavailable analysis null when a current price arrives", () => {
    const product: Product = {
      ...mockProducts[0],
      priceRangeAmount: null,
      priceRangeRate: null,
      sixMonthLowPrice: null,
      sixMonthHighPrice: null,
      sixMonthAveragePrice: null,
      fairPriceMin: null,
      fairPriceMax: null,
      analysis: {
        ...metadata,
        comparable: false,
        observationCount: 1,
        rankingPeriod: "INSUFFICIENT",
      },
    };
    const result = applyCurrentPrice(product, 12345, "2026-10-20T00:00:00Z");
    expect(hasPriceAnalysis(result)).toBe(false);
    expect(result).toMatchObject({
      currentPrice: 12345,
      priceStatus: "INSUFFICIENT_DATA",
      priceRangeAmount: null,
      priceRangeRate: null,
      changeAmount: null,
    });
    expect(getTopPriceRangeProducts(10, [result])).toEqual([]);
  });
  it("allows zero change only when there are enough valid observations", () => {
    const product = {
      ...mockProducts[0],
      priceRangeAmount: 0,
      priceRangeRate: 0,
      analysis: { ...metadata, observationCount: 2 },
    };
    expect(hasPriceAnalysis(product)).toBe(true);
    expect(
      hasPriceAnalysis({
        ...product,
        analysis: { ...metadata, comparable: false, observationCount: 1 },
      })
    ).toBe(false);
  });
  it("preserves rate-first sorting and absolute-range tie breaks, and excludes short products from the main helper", () => {
    const small = {
      ...mockProducts[0],
      id: "small",
      priceRangeRate: 50,
      priceRangeAmount: 100,
      analysis: { ...metadata, rankingPeriod: "SIX_MONTHS" as const },
    };
    const big = { ...small, id: "big", priceRangeAmount: 200 };
    const short = {
      ...big,
      id: "short",
      priceRangeRate: 1000,
      analysis: metadata,
    };
    expect(sortProducts([small, big, short]).map(p => p.id)).toEqual([
      "short",
      "big",
      "small",
    ]);
    expect(
      getTopPriceRangeProducts(10, [small, big, short]).map(p => p.id)
    ).toEqual(["big", "small"]);
  });
  it("labels monthly evidence by month without inventing a day or registration date", () => {
    const label = formatObservationPeriod({
      ...mockProducts[0],
      analysis: metadata,
    });
    expect(label).toBe("2026-08 ~ 2026-09 · 2개 월 이력");
    expect(label).not.toContain("2026-08-01");
  });
});
