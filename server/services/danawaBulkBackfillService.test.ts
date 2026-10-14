import { describe, expect, it, vi } from "vitest";
import type { DanawaBulkBackfillConfig } from "../config/danawaBackfill";
import { DANAWA_GPU_CATEGORY } from "../integrations/danawa/danawaCategory";
import type { Logger } from "../logging/logger";
import type { PriceHistoryRepository } from "../repositories/priceHistoryRepository";
import type { ProductRepository } from "../repositories/productRepository";
import { DanawaBulkBackfillService } from "./danawaBulkBackfillService";

const config: DanawaBulkBackfillConfig = {
  requestDelayMs: 1,
  maxConcurrency: 1,
  retryCount: 1,
  retryBackoffMs: 1,
  requestTimeoutMs: 1_000,
  batchSize: 30,
  listCount: 30,
  targetHistoricalRowCount: 1,
};

describe("DanawaBulkBackfillService", () => {
  it("returns before product discovery when the database target is already met", async () => {
    const productList = { fetchPage: vi.fn() };
    const products = { upsertDanawaProduct: vi.fn() };
    const collector = { collect: vi.fn() };
    const priceHistories = {
      countValidDanawaHistoricalPrices: vi.fn(async () => 10_000),
      saveMonthlyPrices: vi.fn(),
    };
    const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await new DanawaBulkBackfillService(
      productList,
      products,
      collector,
      priceHistories,
      logger,
      { ...config, targetHistoricalRowCount: 10_000 }
    ).run(DANAWA_GPU_CATEGORY);

    expect(result.targetReached).toBe(true);
    expect(productList.fetchPage).not.toHaveBeenCalled();
    expect(priceHistories.saveMonthlyPrices).not.toHaveBeenCalled();
  });

  it("continues after one product fails and reports target progress", async () => {
    const productList = {
      fetchPage: vi.fn(async () => ({
        page: 1,
        totalProductCount: 2,
        totalPages: 1,
        products: ["1", "2"].map(externalProductId => ({
          externalProductId,
          name: `GPU ${externalProductId}`,
          category: "PC 주요 부품_그래픽카드",
          sourceUrl: `https://prod.danawa.com/info/?pcode=${externalProductId}`,
        })),
      })),
    };
    const products: ProductRepository = {
      upsertDanawaProduct: vi.fn(async product => ({
        productId: `danawa-${product.externalProductId}`,
        inserted: true,
      })),
    };
    const collector = {
      collect: vi.fn(async (externalProductId: string) => {
        if (externalProductId === "1") throw new Error("temporary failure");
        return {
          prices: [
            {
              price: 100,
              priceYearMonth: "2026-01",
              granularity: "MONTH" as const,
              sourceType: "HISTORICAL_IMPORT" as const,
            },
          ],
          receivedCount: 1,
          invalidCount: 0,
          selectedPeriod: 24 as const,
        };
      }),
    };
    let count = 0;
    const priceHistories: PriceHistoryRepository = {
      countValidDanawaHistoricalPrices: vi.fn(async () => count),
      saveMonthlyPrices: vi.fn(async () => {
        count += 1;
        return { insertedCount: 1, updatedCount: 0, skippedCount: 0 };
      }),
    };
    const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await new DanawaBulkBackfillService(
      productList,
      products,
      collector,
      priceHistories,
      logger,
      config
    ).run(DANAWA_GPU_CATEGORY);

    expect(result).toMatchObject({
      processedProducts: 2,
      successfulProducts: 1,
      failedProducts: 1,
      insertedPrices: 1,
      currentHistoricalRowCount: 1,
      targetReached: true,
    });
  });
});
