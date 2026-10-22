import { describe, it, expect } from "vitest";
import type { Product } from "../client/src/domain/product";
import { getLargestMonthlyChange } from "./priceInsights";

const product = (priceHistory: Product["priceHistory"], extra = {}) =>
  ({ priceHistory, ...extra }) as Product;
describe("monthly price change evidence", () => {
  it("finds the largest absolute change, independent of input order", () => {
    expect(
      getLargestMonthlyChange(
        product([
          { date: "2026-09", price: 120 },
          { date: "2026-07", price: 200 },
          { date: "2026-08", price: 100 },
        ])
      )
    ).toMatchObject({ from: "2026-07", to: "2026-08", rate: -50 });
  });
  it("never compares across a missing or excluded month", () => {
    expect(
      getLargestMonthlyChange(
        product(
          [
            { date: "2026-07", price: 200 },
            { date: "2026-08", price: 1 },
            { date: "2026-09", price: 100 },
          ],
          { excludedHistoryMonths: ["2026-08"] }
        )
      )
    ).toBeNull();
  });
  it("does not mix live retail prices with monthly history or divide by zero", () => {
    expect(
      getLargestMonthlyChange(
        product(
          [
            { date: "2026-08", price: 0 },
            { date: "2026-09", price: 100 },
          ],
          { currentPrice: 1, currentPriceMonth: "2026-10" }
        )
      )
    ).toBeNull();
  });
  it("compares consecutive months across a year boundary", () => {
    expect(
      getLargestMonthlyChange(
        product([
          { date: "2025-12", price: 100 },
          { date: "2026-01", price: 125 },
        ])
      )?.rate
    ).toBe(25);
  });
});
