import { describe, expect, it, vi } from "vitest";
import type { HistoricalPriceCollector } from "../domain/historicalPrice";
import type { Logger } from "../logging/logger";
import type { PriceHistoryRepository } from "../repositories/priceHistoryRepository";
import type { ProductSourceMappingRepository } from "../repositories/productSourceMappingRepository";
import {
  HistoricalPriceBackfillService,
  ProductSourceMappingNotFoundError,
} from "./historicalPriceBackfillService";

function dependencies() {
  const mappings: ProductSourceMappingRepository = {
    findExternalProductId: vi.fn(async () => "9503733"),
    save: vi.fn(),
  };
  const collector: HistoricalPriceCollector = {
    collect: vi.fn(async () => ({
      prices: [
        {
          priceYearMonth: "2026-07",
          price: 25_940,
          granularity: "MONTH" as const,
          sourceType: "HISTORICAL_IMPORT" as const,
        },
      ],
      receivedCount: 2,
      invalidCount: 1,
      selectedPeriod: 6 as const,
    })),
  };
  const priceHistories: PriceHistoryRepository = {
    recordStatus: vi.fn(),
    countValidDanawaHistoricalPrices: vi.fn(),
    saveMonthlyPrices: vi.fn(async () => ({
      insertedCount: 0,
      updatedCount: 1,
      skippedCount: 0,
    })),
  };
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { mappings, collector, priceHistories, logger };
}

describe("HistoricalPriceBackfillService", () => {
  it("reconfirms current price independently of an absent historical response", async () => {
    const deps = dependencies();
    vi.mocked(deps.collector.collect).mockResolvedValue({
      prices: [],
      receivedCount: 0,
      invalidCount: 0,
      selectedPeriod: 24,
      availability: "NO_SOURCE_DATA",
    });
    const reconfirm = vi.fn(async () => false);
    const service = new HistoricalPriceBackfillService(
      deps.mappings,
      deps.collector,
      deps.priceHistories,
      deps.logger,
      reconfirm
    );
    expect(await service.backfillDanawa("internal-id")).toMatchObject({
      status: "NO_SOURCE_DATA",
      currentPriceFailed: true,
    });
    expect(reconfirm).toHaveBeenCalledWith("internal-id", "9503733");
    expect(deps.priceHistories.saveMonthlyPrices).toHaveBeenCalledWith(
      "internal-id",
      "DANAWA",
      []
    );
  });
  it("collects by mapping and returns insert/update/skip counts", async () => {
    const deps = dependencies();
    const service = new HistoricalPriceBackfillService(
      deps.mappings,
      deps.collector,
      deps.priceHistories,
      deps.logger
    );

    await expect(service.backfillDanawa("gpu-rtx-5080")).resolves.toMatchObject(
      {
        externalProductId: "9503733",
        receivedCount: 2,
        updatedCount: 1,
        skippedCount: 1,
      }
    );
  });

  it("does not call the collector or repository when a mapping is missing", async () => {
    const deps = dependencies();
    vi.mocked(deps.mappings.findExternalProductId).mockResolvedValue(undefined);
    const service = new HistoricalPriceBackfillService(
      deps.mappings,
      deps.collector,
      deps.priceHistories,
      deps.logger
    );

    await expect(service.backfillDanawa("missing")).rejects.toBeInstanceOf(
      ProductSourceMappingNotFoundError
    );
    expect(deps.collector.collect).not.toHaveBeenCalled();
    expect(deps.priceHistories.saveMonthlyPrices).not.toHaveBeenCalled();
  });

  it("does not write anything when external collection fails", async () => {
    const deps = dependencies();
    vi.mocked(deps.collector.collect).mockRejectedValue(
      new Error("network failure")
    );
    const service = new HistoricalPriceBackfillService(
      deps.mappings,
      deps.collector,
      deps.priceHistories,
      deps.logger
    );

    await expect(service.backfillDanawa("gpu-rtx-5080")).rejects.toThrow(
      "network failure"
    );
    expect(deps.priceHistories.saveMonthlyPrices).not.toHaveBeenCalled();
  });
});
