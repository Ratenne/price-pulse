import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProductCard } from "./ProductCard";
import { ProductList } from "./ProductList";
import { PriceRangeBar } from "./PriceRangeBar";
import { PriceRangeRanking } from "./PriceRangeRanking";
import type { Product } from "../domain/product";
import mockProducts from "../data/mockProducts";

vi.mock("wouter", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) =>
    createElement("a", props, children),
}));
vi.mock("../hooks/useProductPage", () => ({
  useProductPage: () => ({
    data: { products: [], summaries: [], total: 0, page: 1, pageSize: 10 },
    loading: false,
    error: null,
    retry() {},
  }),
}));
const base: Product = {
  ...mockProducts[0],
  currentPrice: 12345,
  analysis: {
    comparable: true,
    observationCount: 2,
    monthlyCount: 0,
    firstHistoryMonth: null,
    lastHistoryMonth: null,
    firstObservedAt: "2026-09-30T15:00:00Z",
    lastObservedAt: "2026-10-01T01:00:00Z",
    coverageFirstObservedAt: "2026-09-30T15:00:00Z",
    coverageLastObservedAt: "2026-10-01T01:00:00Z",
    rankingPeriod: "UNDER_SIX_MONTHS",
    dataStatus: "NORMAL",
  },
};
const insufficient: Product = {
  ...base,
  priceStatus: "INSUFFICIENT_DATA",
  priceRangeAmount: null,
  priceRangeRate: null,
  sixMonthLowPrice: null,
  sixMonthHighPrice: null,
  sixMonthAveragePrice: null,
  fairPriceMin: null,
  fairPriceMax: null,
  currentPositionRate: null,
  lowestPriceDifferenceRate: null,
  analysis: {
    ...base.analysis!,
    comparable: false,
    observationCount: 1,
    rankingPeriod: "INSUFFICIENT",
    dataStatus: "INSUFFICIENT_HISTORY",
  },
};
describe("price evidence UI", () => {
  it.each([
    "NORMAL",
    "INSUFFICIENT_HISTORY",
    "NO_SOURCE_DATA",
    "COLLECTION_FAILED",
  ] as const)(
    "uses the approved shortage label without exposing internal %s codes",
    dataStatus => {
      const product = {
        ...insufficient,
        analysis: { ...insufficient.analysis!, dataStatus },
      };
      const html = renderToStaticMarkup(
        createElement(ProductCard, { product })
      );
      expect(html).toContain("데이터 부족");
      expect(html).not.toContain(dataStatus);
    }
  );
  it("keeps product identity and current price while displaying data shortage without a fabricated range", () => {
    const html = renderToStaticMarkup(
      createElement(ProductCard, {
        product: insufficient,
        showRangeAmount: true,
      })
    );
    expect(html).toContain(insufficient.modelName);
    expect(html).toContain("12,345원");
    expect(html).toContain("데이터 부족");
    expect(html).not.toContain("0원");
    expect(html).not.toContain("0.0%");
    expect(html).not.toContain("price-range__marker");
  });
  it("does not draw an estimated price-position bar or assign a rank to an insufficient product", () => {
    expect(
      renderToStaticMarkup(
        createElement(PriceRangeBar, { product: insufficient })
      )
    ).not.toContain("price-range__track");
    const html = renderToStaticMarkup(
      createElement(ProductList, { products: [insufficient], ranked: false })
    );
    expect(html).toContain("데이터 부족");
    expect(html).not.toContain("rank-number");
  });
  it("shows the actual KST observation interval and labels short-period changes accurately", () => {
    const html = renderToStaticMarkup(
      createElement(ProductList, {
        products: [base],
        rangeLabel: "관측 기간 변동폭",
        showObservationPeriod: true,
      })
    );
    expect(html).toContain("관측 기간 변동폭");
    expect(html).not.toContain("6개월 변동폭");
    expect(html).toContain("2026-10-01 00:00:00");
    expect(html).toContain("KST");
  });
  it("keeps the main ranking name and guards against mixing short/insufficient products", () => {
    const long = {
      ...base,
      id: "long-product",
      analysis: { ...base.analysis!, rankingPeriod: "SIX_MONTHS" as const },
    };
    const html = renderToStaticMarkup(
      createElement(PriceRangeRanking, { products: [base, insufficient, long] })
    );
    expect(html).toContain("6개월 가격 변동폭 TOP 10");
    expect(html).toContain("/products/long-product");
    expect(html).not.toContain(`/products/${base.id}`);
  });
  it("does not show a shortage state while the main ranking is still loading", () => {
    const html = renderToStaticMarkup(
      createElement(PriceRangeRanking, { products: [], loading: true })
    );
    expect(html).not.toContain("데이터 부족");
  });
});
