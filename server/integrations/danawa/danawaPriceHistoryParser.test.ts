import { describe, expect, it, vi } from "vitest";
import { DanawaIntegrationError } from "./danawaErrors";
import { parseDanawaMonthlyPrices } from "./danawaPriceHistoryParser";

describe("parseDanawaMonthlyPrices", () => {
  const logger = { warn: vi.fn() };

  it("recognizes coherent explicit zero-count monthly periods without result arrays", () => {
    expect(
      parseDanawaMonthlyPrices(
        { "24": { count: 0 }, "12": { count: 0 }, "6": { count: 0 } },
        logger
      )
    ).toMatchObject({ prices: [], availability: "NO_SOURCE_DATA" });
  });

  it.each([
    {},
    { error: "blocked" },
    { "24": { count: 24 }, "12": { count: 12 }, "6": { count: 6 } },
    { "24": { count: 0 }, "12": { count: 0 }, "6": { count: 1 } },
    { "24": { count: 0 }, "12": { count: 0 }, "6": { count: 0, result: null } },
    {
      "24": { count: 0 },
      "12": { count: 0 },
      "6": { count: 0 },
      error: "blocked",
    },
  ])(
    "does not infer source absence from ambiguous or inconsistent response %j",
    response => {
      expect(() => parseDanawaMonthlyPrices(response, logger)).toThrow(
        DanawaIntegrationError
      );
    }
  );

  it("maps a valid monthly result to internal prices", () => {
    const result = parseDanawaMonthlyPrices(
      {
        "1": { result: [{ date: "08-19", minPrice: 1 }] },
        "6": {
          count: 2,
          result: [
            { date: "26-07", minPrice: 25_940 },
            { date: "26-08", minPrice: 38_250 },
          ],
        },
      },
      logger
    );

    expect(result).toEqual({
      prices: [
        {
          priceYearMonth: "2026-07",
          price: 25_940,
          granularity: "MONTH",
          sourceType: "HISTORICAL_IMPORT",
        },
        {
          priceYearMonth: "2026-08",
          price: 38_250,
          granularity: "MONTH",
          sourceType: "HISTORICAL_IMPORT",
        },
      ],
      receivedCount: 2,
      invalidCount: 0,
      selectedPeriod: 6,
    });
  });

  it("prefers 24 months and ignores shorter overlapping periods", () => {
    const result = parseDanawaMonthlyPrices(
      {
        "24": { result: [{ date: "25-01", minPrice: 100 }] },
        "12": { result: [{ date: "25-01", minPrice: 200 }] },
        "6": { result: [{ date: "25-01", minPrice: 300 }] },
      },
      logger
    );

    expect(result.selectedPeriod).toBe(24);
    expect(result.prices).toHaveLength(1);
    expect(result.prices[0].price).toBe(100);
  });

  it("falls back from empty 24 months to 12 and then 6 months", () => {
    expect(
      parseDanawaMonthlyPrices(
        {
          "24": { result: [] },
          "12": { result: [{ date: "26-01", minPrice: 200 }] },
          "6": { result: [{ date: "26-01", minPrice: 300 }] },
        },
        logger
      ).selectedPeriod
    ).toBe(12);
    expect(
      parseDanawaMonthlyPrices(
        {
          "24": { result: [] },
          "12": { result: [] },
          "6": { result: [{ date: "26-01", minPrice: 300 }] },
        },
        logger
      ).selectedPeriod
    ).toBe(6);
  });

  it("skips null, zero, and negative prices while preserving valid rows", () => {
    const result = parseDanawaMonthlyPrices(
      {
        "6": {
          result: [
            { date: "26-04", minPrice: null },
            { date: "26-05", minPrice: 0 },
            { date: "26-06", minPrice: -1 },
            { date: "26-07", minPrice: 25_940 },
          ],
        },
      },
      logger
    );

    expect(result.prices).toHaveLength(1);
    expect(result.invalidCount).toBe(3);
  });

  it("fails when every supported monthly period is missing", () => {
    expect(() =>
      parseDanawaMonthlyPrices({ "3": { result: [] } }, logger)
    ).toThrow(DanawaIntegrationError);
  });

  it("fails without producing data when every received row is invalid", () => {
    expect(() =>
      parseDanawaMonthlyPrices(
        { "6": { result: [{ date: "invalid", minPrice: 100 }] } },
        logger
      )
    ).toThrow("no valid monthly 24, 12, or 6 period");
  });
});
