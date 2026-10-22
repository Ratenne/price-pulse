import type { DiscoveredProduct } from "../domain/discoveredProduct";
import {
  PRICE_SOURCE,
  type HistoricalPriceCollector,
} from "../domain/historicalPrice";
import type { DanawaBulkBackfillConfig } from "../config/danawaBackfill";
import type { DanawaCategoryMapping } from "../integrations/danawa/danawaCategory";
import type { DanawaProductListClient } from "../integrations/danawa/danawaProductListClient";
import type { Logger } from "../logging/logger";
import type { PriceHistoryRepository } from "../repositories/priceHistoryRepository";
import type { ProductRepository } from "../repositories/productRepository";
import { koreaYearMonth } from "../domain/priceCalendar";
import { DanawaIntegrationError } from "../integrations/danawa/danawaErrors";
import type { LivePriceSnapshotRepository } from "../repositories/livePriceSnapshotRepository";
import {
  completedHistoricalCollection,
  collectionFailure,
} from "../domain/priceCollection";

export interface DanawaBulkBackfillProgress {
  currentPage: number;
  totalPages: number;
  discoveredProducts: number;
  uniqueProducts: number;
  insertedProducts: number;
  processedProducts: number;
  successfulProducts: number;
  failedProducts: number;
  noSourceDataProducts: number;
  insufficientHistoryProducts: number;
  currentPriceFailures: number;
  currentPriceSuccesses: number | null;
  currentPriceFailureDetails: { externalProductId: string; reason: string }[];
  currentPriceCollectionEnabled: boolean;
  failedPages: number;
  insertedPrices: number;
  updatedPrices: number;
  skippedPrices: number;
  duplicatePrices: number | null;
  conflictingPrices: number | null;
  incomparablePrices: number | null;
  excludedCurrentMonthPrices: number;
  excludedFutureMonthPrices: number;
  fullScanMode: boolean;
  invalidPrices: number;
  currentHistoricalRowCount: number;
  targetHistoricalRowCount: number;
  targetReached: boolean;
}

export function danawaBulkBackfillExitCode(
  summary: Pick<DanawaBulkBackfillProgress, "failedPages" | "failedProducts">
): 0 | 2 {
  return summary.failedPages > 0 || summary.failedProducts > 0 ? 2 : 0;
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  processItem: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await processItem(item);
      }
    }
  );
  await Promise.all(workers);
}

export class DanawaBulkBackfillService {
  constructor(
    private readonly productList: Pick<DanawaProductListClient, "fetchPage">,
    private readonly products: ProductRepository,
    private readonly collector: HistoricalPriceCollector,
    private readonly priceHistories: PriceHistoryRepository,
    private readonly logger: Logger,
    private readonly config: DanawaBulkBackfillConfig,
    private readonly currentPrices?: Pick<
      LivePriceSnapshotRepository,
      "applyPrices" | "recordUnobserved"
    >
  ) {}

  async run(
    category: DanawaCategoryMapping,
    now = new Date()
  ): Promise<DanawaBulkBackfillProgress> {
    const seenProductCodes = new Set<string>();
    const progress: DanawaBulkBackfillProgress = {
      currentPage: 0,
      totalPages: 0,
      discoveredProducts: 0,
      uniqueProducts: 0,
      insertedProducts: 0,
      processedProducts: 0,
      successfulProducts: 0,
      failedProducts: 0,
      noSourceDataProducts: 0,
      insufficientHistoryProducts: 0,
      currentPriceFailures: 0,
      currentPriceSuccesses: this.currentPrices ? 0 : null,
      currentPriceFailureDetails: [],
      currentPriceCollectionEnabled: !!this.currentPrices,
      failedPages: 0,
      insertedPrices: 0,
      updatedPrices: 0,
      skippedPrices: 0,
      duplicatePrices: 0,
      conflictingPrices: 0,
      incomparablePrices: 0,
      excludedCurrentMonthPrices: 0,
      excludedFutureMonthPrices: 0,
      fullScanMode: this.config.targetHistoricalRowCount === 0,
      invalidPrices: 0,
      currentHistoricalRowCount:
        await this.priceHistories.countValidDanawaHistoricalPrices(),
      targetHistoricalRowCount: this.config.targetHistoricalRowCount,
      targetReached: false,
    };
    progress.targetReached =
      progress.targetHistoricalRowCount > 0 &&
      progress.currentHistoricalRowCount >= progress.targetHistoricalRowCount;
    if (progress.targetReached) {
      this.logger.info("Danawa bulk backfill target already reached", {
        ...progress,
      });
      return progress;
    }

    let page = 1;
    while (progress.totalPages === 0 || page <= progress.totalPages) {
      progress.currentPage = page;
      let discoveredPage;
      try {
        discoveredPage = await this.productList.fetchPage(category, page);
      } catch (error) {
        if (page === 1) throw error;
        progress.failedPages += 1;
        this.logger.error("Danawa product discovery page failed", {
          currentPage: page,
          exceptionType: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          ...(error instanceof DanawaIntegrationError
            ? { failureStage: error.stage, httpStatus: error.status }
            : {}),
        });
        page += 1;
        continue;
      }

      progress.totalPages = discoveredPage.totalPages;
      progress.discoveredProducts += discoveredPage.products.length;
      const uniqueOnPage = discoveredPage.products.filter(product => {
        if (seenProductCodes.has(product.externalProductId)) return false;
        seenProductCodes.add(product.externalProductId);
        return true;
      });
      progress.uniqueProducts = seenProductCodes.size;

      for (
        let offset = 0;
        offset < uniqueOnPage.length;
        offset += this.config.batchSize
      ) {
        const batch = uniqueOnPage.slice(
          offset,
          offset + this.config.batchSize
        );
        await processWithConcurrency(
          batch,
          this.config.maxConcurrency,
          product => this.processProduct(product, progress, now)
        );
      }

      progress.currentHistoricalRowCount =
        await this.priceHistories.countValidDanawaHistoricalPrices();
      progress.targetReached =
        progress.targetHistoricalRowCount > 0 &&
        progress.currentHistoricalRowCount >= progress.targetHistoricalRowCount;
      this.logger.info("Danawa bulk backfill page completed", { ...progress });
      if (progress.targetReached) break;
      page += 1;
    }

    return progress;
  }

  private async processProduct(
    product: DiscoveredProduct,
    progress: DanawaBulkBackfillProgress,
    now: Date
  ): Promise<void> {
    const upsert = await this.products.upsertDanawaProduct(product);
    if (upsert.inserted) progress.insertedProducts += 1;
    progress.processedProducts += 1;

    if (this.currentPrices) {
      const reason =
        product.currentMinPrice === undefined
          ? (product.currentPriceFailureReason ?? "CURRENT_PRICE_NOT_PROVIDED")
          : !Number.isSafeInteger(product.currentMinPrice) ||
              product.currentMinPrice <= 0
            ? "INVALID_CURRENT_PRICE"
            : !product.observedAt
              ? "OBSERVATION_TIME_NOT_PROVIDED"
              : !Number.isFinite(Date.parse(product.observedAt))
                ? "INVALID_OBSERVATION_TIME"
                : undefined;
      if (!reason) {
        // Repository/transaction/integrity errors must propagate as fatal errors.
        await this.currentPrices.applyPrices(
          new Map([[product.externalProductId, product.currentMinPrice!]]),
          product.observedAt!
        );
        if (progress.currentPriceSuccesses !== null)
          progress.currentPriceSuccesses++;
      } else {
        progress.currentPriceFailures++;
        progress.currentPriceFailureDetails.push({
          externalProductId: product.externalProductId,
          reason,
        });
        this.logger.warn("Danawa product current price unavailable", {
          source: PRICE_SOURCE.DANAWA,
          externalProductId: product.externalProductId,
          reason,
        });
        await this.currentPrices.recordUnobserved(
          [],
          new Date().toISOString(),
          reason,
          [product.externalProductId]
        );
      }
    }

    let collection;
    try {
      collection = await this.collector.collect(product.externalProductId);
    } catch (error) {
      progress.failedProducts += 1;
      await this.priceHistories.recordStatus(upsert.productId, {
        status: "COLLECTION_FAILED",
        reason: collectionFailure(error),
        checkedAt: new Date().toISOString(),
      });
      this.logger.warn("Danawa product historical collection failed", {
        source: PRICE_SOURCE.DANAWA,
        externalProductId: product.externalProductId,
        exceptionType: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        failureStage: collectionFailure(error),
        ...(error instanceof DanawaIntegrationError
          ? {
              failureStage: error.stage,
              httpStatus: error.status,
              causeType:
                error.cause instanceof Error ? error.cause.name : undefined,
            }
          : {}),
      });
      return;
    }

    const resultStatus = completedHistoricalCollection(collection, now);
    const currentMonth = koreaYearMonth(now);
    progress.excludedCurrentMonthPrices += collection.prices.filter(
      p => p.priceYearMonth === currentMonth
    ).length;
    progress.excludedFutureMonthPrices += collection.prices.filter(
      p => p.priceYearMonth > currentMonth
    ).length;
    if (!resultStatus.prices.length) {
      const context = {
        source: PRICE_SOURCE.DANAWA,
        externalProductId: product.externalProductId,
        reason: "NO_COMPLETED_MONTHLY_PRICES",
        collectedPrices: collection.prices.length,
        collectedYearMonths: collection.prices.map(
          price => price.priceYearMonth
        ),
        selectedPeriod: collection.selectedPeriod,
        invalidPrices: collection.invalidCount,
        currentMonth: koreaYearMonth(now),
        collectionStatus: resultStatus.status,
        classificationReason: resultStatus.reason,
      };
      if (resultStatus.status === "COLLECTION_FAILED") {
        this.logger.warn(
          "Danawa product has no completed historical prices",
          context
        );
      } else {
        this.logger.info(
          "Danawa product has no completed historical prices",
          context
        );
      }
    }
    const writeResult = await this.priceHistories.saveMonthlyPrices(
      upsert.productId,
      PRICE_SOURCE.DANAWA,
      resultStatus.prices
    );
    await this.priceHistories.recordStatus(upsert.productId, {
      ...resultStatus,
      checkedAt: new Date().toISOString(),
    });
    if (resultStatus.status === "COLLECTION_FAILED") progress.failedProducts++;
    else progress.successfulProducts++;
    if (resultStatus.status === "NO_SOURCE_DATA")
      progress.noSourceDataProducts++;
    if (resultStatus.status === "INSUFFICIENT_HISTORY")
      progress.insufficientHistoryProducts++;
    progress.insertedPrices += writeResult.insertedCount;
    progress.updatedPrices += writeResult.updatedCount;
    progress.skippedPrices += writeResult.skippedCount;
    if (writeResult.comparisons === undefined) {
      // Older repositories cannot split legacy skips reliably.
      progress.duplicatePrices = null;
      progress.conflictingPrices = null;
      progress.incomparablePrices = null;
    } else {
      for (const comparison of writeResult.comparisons) {
        if (comparison.outcome === "DUPLICATE") {
          if (progress.duplicatePrices !== null) progress.duplicatePrices++;
        } else if (comparison.outcome === "CONFLICT") {
          if (progress.conflictingPrices !== null) progress.conflictingPrices++;
        } else if (progress.incomparablePrices !== null)
          progress.incomparablePrices++;
        if (comparison.outcome !== "DUPLICATE") {
          this.logger.warn("Danawa monthly price comparison requires review", {
            source: PRICE_SOURCE.DANAWA,
            externalProductId: product.externalProductId,
            ...comparison,
          });
        }
      }
    }
    progress.invalidPrices += collection.invalidCount;
  }
}
