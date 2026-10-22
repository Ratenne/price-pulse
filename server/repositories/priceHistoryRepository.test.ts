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
      [monthly("2026-07", 25_940)],
      [monthly("2026-07", 25_940)]
    );

    expect(result).toMatchObject({
      inserts: [],
      updates: [],
      skippedCount: 1,
      comparisons: [{ outcome: "DUPLICATE", reason: "SAME_MONTHLY_PRICE" }],
    });
  });

  it("preserves an existing month when a later response changes its price", () => {
    const changed = monthly("2026-07", 26_000);
    const result = buildPriceHistoryChangeSet(
      [monthly("2026-07", 25_940)],
      [changed]
    );

    expect(result).toMatchObject({
      inserts: [],
      updates: [],
      skippedCount: 1,
      comparisons: [
        { outcome: "CONFLICT", existingPrice: 25_940, incomingPrice: 26_000 },
      ],
    });
  });

  it("inserts only months that do not exist", () => {
    const added = monthly("2026-08", 38_250);
    const result = buildPriceHistoryChangeSet([], [added]);
    expect(result.inserts).toEqual([added]);
  });

  it("does not declare a conflict without a known monthly price definition", () => {
    const existing = [{ priceYearMonth: "2026-07", price: 100 }];
    const incoming = [monthly("2026-07", 200)];
    const result = buildPriceHistoryChangeSet(existing, incoming);
    expect(result).toMatchObject({
      inserts: [],
      updates: [],
      skippedCount: 1,
      comparisons: [
        { outcome: "INCOMPARABLE", reason: "PRICE_DEFINITION_UNCLEAR" },
      ],
    });
    expect(existing).toEqual([{ priceYearMonth: "2026-07", price: 100 }]);
    expect(incoming).toEqual([monthly("2026-07", 200)]);
  });

  it("preserves prices with incompatible provenance or unsafe numeric values", () => {
    for (const existing of [
      { ...monthly("2026-07", 100), sourceType: "UNKNOWN" },
      monthly("2026-07", Number.MAX_SAFE_INTEGER + 1),
    ]) {
      const result = buildPriceHistoryChangeSet(
        [existing],
        [monthly("2026-07", 200)]
      );
      expect(result.inserts).toEqual([]);
      expect(result.updates).toEqual([]);
      expect(result.comparisons[0].outcome).toBe("INCOMPARABLE");
    }
  });

  it("classifies each skipped month once, including repeated incoming months", () => {
    const result = buildPriceHistoryChangeSet(
      [monthly("2026-07", 100)],
      [
        monthly("2026-07", 100),
        monthly("2026-07", 200),
        monthly("2026-08", 300),
        monthly("2026-08", 300),
      ]
    );
    expect(result.inserts).toEqual([monthly("2026-08", 300)]);
    expect(result.updates).toEqual([]);
    expect(result.skippedCount).toBe(3);
    expect(result.comparisons.map(c => c.outcome)).toEqual([
      "DUPLICATE",
      "CONFLICT",
      "DUPLICATE",
    ]);
  });
});
