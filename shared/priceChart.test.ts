import { describe, expect, it } from "vitest";
import type { Product } from "../client/src/domain/product";
import { buildPriceChartData } from "./priceChart";

describe("reviewed price chart gaps", () => {
  const product = {
    priceHistory: [
      { date: "2026-07", price: 1825960 },
      { date: "2026-09", price: 2760680 },
    ],
    excludedHistoryMonths: ["2026-08"],
    currentPrice: 2781930,
    currentPriceMonth: "2026-10",
  } as Product;
  it("leaves a null gap and keeps the live price separate", () => {
    expect(buildPriceChartData(product)).toEqual([
      { date: "2026-07", price: 1825960 },
      { date: "2026-08", price: null },
      { date: "2026-09", price: 2760680 },
      { date: "2026-10", price: 2781930 },
    ]);
  });
  it("does not invent missing months or prices when live data is unavailable", () => {
    expect(
      buildPriceChartData({
        ...product,
        currentPrice: null,
        excludedHistoryMonths: [],
      })
    ).toEqual(product.priceHistory);
  });
  it("does not leak a raw excluded value even if it is accidentally supplied", () => {
    const data = buildPriceChartData({
      ...product,
      priceHistory: [...product.priceHistory, { date: "2026-08", price: 1 }],
    });
    expect(data.filter(p => p.date === "2026-08")).toEqual([
      { date: "2026-08", price: null },
    ]);
  });
});
