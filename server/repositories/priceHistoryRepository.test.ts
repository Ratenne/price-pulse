import { describe, expect, it } from "vitest";
import type { HistoricalPrice } from "../domain/historicalPrice";
import { buildPriceHistoryChangeSet } from "./priceHistoryRepository";

function monthly(priceYearMonth: string, price: number): HistoricalPrice {
  return {
    priceYearMonth,
    price,
    granularity: "MONTH",
    sourceType: "HISTORICAL_IMPORT",
  };
}

describe("buildPriceHistoryChangeSet", () => {
  it("skips the same monthly price instead of creating a duplicate", () => {
    const result = buildPriceHistoryChangeSet(
      [{ priceYearMonth: "2026-07", price: 25_940 }],
      [monthly("2026-07", 25_940)]
    );

    expect(result).toEqual({ inserts: [], updates: [], skippedCount: 1 });
  });

  it("preserves an existing month when a later response changes its price", () => {
    const changed = monthly("2026-07", 26_000);
    const result = buildPriceHistoryChangeSet(
      [{ priceYearMonth: "2026-07", price: 25_940 }],
      [changed]
    );

    expect(result).toEqual({
      inserts: [],
      updates: [],
      skippedCount: 1,
    });
  });

  it("inserts only months that do not exist", () => {
    const added = monthly("2026-08", 38_250);
    const result = buildPriceHistoryChangeSet([], [added]);
    expect(result.inserts).toEqual([added]);
  });
});
