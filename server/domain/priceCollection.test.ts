import { describe, expect, it } from "vitest";
import { completedHistoricalCollection } from "./priceCollection";
import type { HistoricalPriceCollection } from "./historicalPrice";
const now = new Date("2026-10-20T01:00:00Z");
function collection(months: string[]): HistoricalPriceCollection {
  return {
    prices: months.map(priceYearMonth => ({
      priceYearMonth,
      price: 100,
      granularity: "MONTH",
      sourceType: "HISTORICAL_IMPORT",
    })),
    receivedCount: months.length,
    invalidCount: 0,
    selectedPeriod: 24,
  };
}
describe("historical collection states", () => {
  it("distinguishes current-only, empty-source and malformed responses", () => {
    expect(
      completedHistoricalCollection(collection(["2026-10"]), now)
    ).toMatchObject({ prices: [], status: "INSUFFICIENT_HISTORY" });
    expect(
      completedHistoricalCollection(
        { ...collection([]), availability: "NO_SOURCE_DATA" },
        now
      ).status
    ).toBe("NO_SOURCE_DATA");
    expect(completedHistoricalCollection(collection([]), now).status).toBe(
      "COLLECTION_FAILED"
    );
    expect(
      completedHistoricalCollection(collection(["2026-11"]), now).status
    ).toBe("COLLECTION_FAILED");
  });
  it("preserves valid completed prices but reports partial parsing errors", () => {
    const result = completedHistoricalCollection(
      { ...collection(["2026-09", "2026-10"]), invalidCount: 1 },
      now
    );
    expect(result.status).toBe("COLLECTION_FAILED");
    expect(result.prices.map(p => p.priceYearMonth)).toEqual(["2026-09"]);
  });
});
