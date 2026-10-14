import { describe, expect, it, vi } from "vitest";
import { refreshWeeklyPrices } from "./weeklyPriceRefresh";
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const products = [
  { product_id: "1", external_product_id: "1" },
  { product_id: "2", external_product_id: "2" },
];
describe("weekly refresh", () => {
  it("isolates an HTTP failure and persists only completed months", async () => {
    const saveMonthlyPrices = vi.fn(async () => ({
      insertedCount: 1,
      updatedCount: 0,
      skippedCount: 0,
    }));
    const collect = vi.fn(async (id: string) => {
      if (id === "1") throw new Error("HTTP 503");
      return {
        prices: ["2026-09", "2026-10", "2026-11"].map(priceYearMonth => ({
          priceYearMonth,
          price: 100,
          granularity: "MONTH" as const,
          sourceType: "HISTORICAL_IMPORT" as const,
        })),
        receivedCount: 3,
        invalidCount: 0,
        selectedPeriod: 24 as const,
      };
    });
    const summary = await refreshWeeklyPrices(
      products,
      { collect },
      { saveMonthlyPrices },
      logger,
      new Date("2026-10-14T00:00:00Z")
    );
    expect(summary).toMatchObject({
      processed: 2,
      failed: 1,
      successful: 1,
      inserted: 1,
    });
    expect(saveMonthlyPrices.mock.calls[0]).toEqual([
      "2",
      "DANAWA",
      [
        {
          priceYearMonth: "2026-09",
          price: 100,
          granularity: "MONTH",
          sourceType: "HISTORICAL_IMPORT",
        },
      ],
    ]);
  });
  it("stops on database failure", async () => {
    const collect = vi.fn(async () => ({
      prices: [
        {
          priceYearMonth: "2026-09",
          price: 100,
          granularity: "MONTH" as const,
          sourceType: "HISTORICAL_IMPORT" as const,
        },
      ],
      receivedCount: 1,
      invalidCount: 0,
      selectedPeriod: 24 as const,
    }));
    await expect(
      refreshWeeklyPrices(
        products,
        { collect },
        {
          saveMonthlyPrices: async () => {
            throw new Error("DB down");
          },
        },
        logger,
        new Date("2026-10-14T00:00:00Z")
      )
    ).rejects.toThrow("DB down");
    expect(collect).toHaveBeenCalledTimes(1);
  });
});
