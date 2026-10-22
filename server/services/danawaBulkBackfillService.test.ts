import { describe, expect, it, vi } from "vitest";
import type { DanawaBulkBackfillConfig } from "../config/danawaBackfill";
import { DANAWA_GPU_CATEGORY } from "../integrations/danawa/danawaCategory";
import type { Logger } from "../logging/logger";
import type { PriceHistoryRepository } from "../repositories/priceHistoryRepository";
import type { ProductRepository } from "../repositories/productRepository";
import {
  DanawaBulkBackfillService,
  danawaBulkBackfillExitCode,
} from "./danawaBulkBackfillService";

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
  it("scans every page above the DB target in unlimited mode and saves only completed Korean months", async () => {
    const productList = {
      fetchPage: vi.fn(async (_category, page: number) => ({
        page,
        totalProductCount: 2,
        totalPages: 2,
        products: [
          {
            externalProductId: String(page),
            name: `GPU ${page}`,
            category: "PC 주요 부품_그래픽카드",
            sourceUrl: `https://prod.danawa.com/info/?pcode=${page}`,
          },
        ],
      })),
    };
    const products: ProductRepository = {
      upsertDanawaProduct: vi.fn(async product => ({
        productId: `danawa-${product.externalProductId}`,
        inserted: false,
      })),
    };
    const collector = {
      collect: vi.fn(async () => ({
        prices: ["2026-09", "2026-10", "2026-11"].map(priceYearMonth => ({
          price: 100,
          priceYearMonth,
          granularity: "MONTH" as const,
          sourceType: "HISTORICAL_IMPORT" as const,
        })),
        receivedCount: 3,
        invalidCount: 0,
        selectedPeriod: 24 as const,
      })),
    };
    const priceHistories: PriceHistoryRepository = {
      recordStatus: vi.fn(),
      countValidDanawaHistoricalPrices: vi.fn(async () => 20_000),
      saveMonthlyPrices: vi.fn<PriceHistoryRepository["saveMonthlyPrices"]>(
        async () => ({
          insertedCount: 0,
          updatedCount: 0,
          skippedCount: 1,
        })
      ),
    };
    const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const result = await new DanawaBulkBackfillService(
      productList,
      products,
      collector,
      priceHistories,
      logger,
      { ...config, targetHistoricalRowCount: 0 }
    ).run(DANAWA_GPU_CATEGORY, new Date("2026-09-30T15:00:00Z"));

    expect(productList.fetchPage).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      successfulProducts: 2,
      targetReached: false,
      fullScanMode: true,
      excludedCurrentMonthPrices: 2,
      excludedFutureMonthPrices: 2,
      duplicatePrices: null,
    });
    expect(priceHistories.saveMonthlyPrices).toHaveBeenNthCalledWith(
      1,
      "danawa-1",
      "DANAWA",
      [
        {
          price: 100,
          priceYearMonth: "2026-09",
          granularity: "MONTH",
          sourceType: "HISTORICAL_IMPORT",
        },
      ]
    );
  });

  it("returns before product discovery when the database target is already met", async () => {
    const productList = { fetchPage: vi.fn() };
    const products = { upsertDanawaProduct: vi.fn() };
    const collector = { collect: vi.fn() };
    const priceHistories = {
      recordStatus: vi.fn(),
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
      recordStatus: vi.fn(),
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
    expect(danawaBulkBackfillExitCode(result)).toBe(2);
  });

  function fixture(
    current: {
      currentMinPrice?: number;
      observedAt?: string;
      currentPriceFailureReason?: "INVALID_CURRENT_PRICE";
    } = {}
  ) {
    const productList = {
      fetchPage: vi.fn(async () => ({
        page: 1,
        totalPages: 1,
        totalProductCount: 12,
        products: Array.from({ length: 12 }, (_, i) => ({
          externalProductId: String(i),
          name: `GPU ${i}`,
          category: "GPU",
          sourceUrl: `https://prod.danawa.com/info/?pcode=${i}`,
          ...current,
        })),
      })),
    };
    const products = {
      upsertDanawaProduct: vi.fn(async p => ({
        productId: `danawa-${p.externalProductId}`,
        inserted: false,
      })),
    };
    const collector = {
      collect: vi.fn(async () => ({
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
      })),
    };
    const histories = {
      recordStatus: vi.fn(),
      countValidDanawaHistoricalPrices: vi.fn(async () => 14593),
      saveMonthlyPrices: vi.fn<PriceHistoryRepository["saveMonthlyPrices"]>(
        async () => ({
          insertedCount: 0,
          updatedCount: 0,
          skippedCount: 1,
          comparisons: [
            {
              priceYearMonth: "2026-09",
              existingPrice: 100,
              incomingPrice: 100,
              outcome: "DUPLICATE" as const,
              reason: "SAME_MONTHLY_PRICE" as const,
            },
          ],
        })
      ),
    };
    const currentPrices = {
      applyPrices: vi.fn(async () => ({ updated: 1 })),
      recordUnobserved: vi.fn(async () => ({ failed: 1 })),
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const service = new DanawaBulkBackfillService(
      productList,
      products,
      collector,
      histories,
      logger,
      { ...config, targetHistoricalRowCount: 0 },
      currentPrices
    );
    return { service, collector, histories, currentPrices, logger };
  }

  it("succeeds with 12 current-price warnings and zero inserts, preserving duplicate diagnostics", async () => {
    const f = fixture();
    const result = await f.service.run(
      DANAWA_GPU_CATEGORY,
      new Date("2026-10-22T00:00:00Z")
    );
    expect(result).toMatchObject({
      successfulProducts: 12,
      failedProducts: 0,
      currentPriceFailures: 12,
      currentPriceSuccesses: 0,
      insertedPrices: 0,
      updatedPrices: 0,
      skippedPrices: 12,
      duplicatePrices: 12,
      conflictingPrices: 0,
      incomparablePrices: 0,
      fullScanMode: true,
    });
    expect(danawaBulkBackfillExitCode(result)).toBe(0);
    expect(f.collector.collect).toHaveBeenCalledTimes(12);
    expect(f.currentPrices.applyPrices).not.toHaveBeenCalled();
    expect(f.currentPrices.recordUnobserved).toHaveBeenCalledTimes(12);
    expect(f.logger.warn).toHaveBeenCalledTimes(12);
    expect(result.currentPriceFailureDetails).toEqual(
      Array.from({ length: 12 }, (_, i) => ({
        externalProductId: String(i),
        reason: "CURRENT_PRICE_NOT_PROVIDED",
      }))
    );
  });

  it.each([
    [
      { currentPriceFailureReason: "INVALID_CURRENT_PRICE" as const },
      "INVALID_CURRENT_PRICE",
    ],
    [
      { currentMinPrice: 0, observedAt: "2026-10-22T00:00:00Z" },
      "INVALID_CURRENT_PRICE",
    ],
    [{ currentMinPrice: 100 }, "OBSERVATION_TIME_NOT_PROVIDED"],
    [
      { currentMinPrice: 100, observedAt: "invalid" },
      "INVALID_OBSERVATION_TIME",
    ],
  ])(
    "continues history collection after invalid current-price input %j",
    async (current, reason) => {
      const f = fixture(current);
      const result = await f.service.run(DANAWA_GPU_CATEGORY);
      expect(result.currentPriceFailureDetails[0].reason).toBe(reason);
      expect(result.successfulProducts).toBe(12);
      expect(danawaBulkBackfillExitCode(result)).toBe(0);
      expect(f.currentPrices.applyPrices).not.toHaveBeenCalled();
    }
  );

  it("counts successful current-price processing separately", async () => {
    const f = fixture({
      currentMinPrice: 100,
      observedAt: "2026-10-22T00:00:00Z",
    });
    const result = await f.service.run(DANAWA_GPU_CATEGORY);
    expect(result.currentPriceSuccesses).toBe(12);
    expect(result.currentPriceFailures).toBe(0);
  });

  it("reports conflicts and unknown definitions separately without failing historical processing", async () => {
    const f = fixture({
      currentMinPrice: 100,
      observedAt: "2026-10-22T00:00:00Z",
    });
    f.histories.saveMonthlyPrices.mockResolvedValue({
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      comparisons: [
        {
          priceYearMonth: "2026-09",
          existingPrice: 200,
          incomingPrice: 100,
          outcome: "CONFLICT",
          reason: "DIFFERENT_MONTHLY_PRICE",
        },
      ],
    });
    const result = await f.service.run(DANAWA_GPU_CATEGORY);
    expect(result).toMatchObject({
      duplicatePrices: 0,
      conflictingPrices: 12,
      incomparablePrices: 0,
      skippedPrices: 12,
      insertedPrices: 0,
      updatedPrices: 0,
      successfulProducts: 12,
    });
    expect(danawaBulkBackfillExitCode(result)).toBe(0);
    expect(f.logger.warn).toHaveBeenCalledWith(
      "Danawa monthly price comparison requires review",
      expect.objectContaining({
        externalProductId: "0",
        outcome: "CONFLICT",
        existingPrice: 200,
        incomingPrice: 100,
      })
    );

    f.histories.saveMonthlyPrices.mockResolvedValue({
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      comparisons: [
        {
          priceYearMonth: "2026-09",
          existingPrice: 100,
          incomingPrice: 100,
          outcome: "INCOMPARABLE",
          reason: "PRICE_DEFINITION_UNCLEAR",
        },
      ],
    });
    const unknown = await f.service.run(DANAWA_GPU_CATEGORY);
    expect(unknown).toMatchObject({
      duplicatePrices: 0,
      conflictingPrices: 0,
      incomparablePrices: 12,
    });
    expect(danawaBulkBackfillExitCode(unknown)).toBe(0);
  });

  it.each([
    "OBSERVATION_CONFLICT",
    "INVALID_OBSERVATION",
    "connection refused",
  ])(
    "does not downgrade repository error %s to a current-price warning",
    async message => {
      const f = fixture({
        currentMinPrice: 100,
        observedAt: "2026-10-22T00:00:00Z",
      });
      f.currentPrices.applyPrices.mockRejectedValue(new Error(message));
      await expect(f.service.run(DANAWA_GPU_CATEGORY)).rejects.toThrow(message);
      expect(f.logger.warn).not.toHaveBeenCalled();
      expect(f.collector.collect).not.toHaveBeenCalled();
    }
  );

  it.each(["applyPrices", "recordUnobserved"] as const)(
    "does not swallow persistence errors in %s",
    async method => {
      const f = fixture(
        method === "applyPrices"
          ? { currentMinPrice: 100, observedAt: "2026-10-22T00:00:00Z" }
          : {}
      );
      const error = Object.assign(new Error("database transaction failed"), {
        code: "23505",
      });
      f.currentPrices[method].mockRejectedValue(error);
      await expect(f.service.run(DANAWA_GPU_CATEGORY)).rejects.toBe(error);
      expect(f.collector.collect).not.toHaveBeenCalled();
    }
  );

  it("propagates historical writes and status persistence errors", async () => {
    for (const method of ["saveMonthlyPrices", "recordStatus"] as const) {
      const f = fixture();
      const error = new Error("DB unavailable");
      f.histories[method].mockRejectedValue(error);
      await expect(f.service.run(DANAWA_GPU_CATEGORY)).rejects.toBe(error);
    }
  });

  it("keeps discovery page failures as execution failures", () => {
    expect(
      danawaBulkBackfillExitCode({ failedProducts: 0, failedPages: 1 })
    ).toBe(2);
  });
});
