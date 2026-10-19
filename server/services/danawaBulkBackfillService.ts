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

export interface DanawaBulkBackfillProgress {
  currentPage: number;
  totalPages: number;
  discoveredProducts: number;
  uniqueProducts: number;
  insertedProducts: number;
  processedProducts: number;
  successfulProducts: number;
  failedProducts: number;
  failedPages: number;
  insertedPrices: number;
  updatedPrices: number;
  skippedPrices: number;
  invalidPrices: number;
  currentHistoricalRowCount: number;
  targetHistoricalRowCount: number;
  targetReached: boolean;
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
    private readonly config: DanawaBulkBackfillConfig
  ) {}

  async run(
    category: DanawaCategoryMapping,
    now = new Date()
  ): Promise<DanawaBulkBackfillProgress> {
    const currentMonth = koreaYearMonth(now);
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
      failedPages: 0,
      insertedPrices: 0,
      updatedPrices: 0,
      skippedPrices: 0,
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
          product => this.processProduct(product, progress, currentMonth)
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
    currentMonth: string
  ): Promise<void> {
    const upsert = await this.products.upsertDanawaProduct(product);
    if (upsert.inserted) progress.insertedProducts += 1;
    progress.processedProducts += 1;

    let collection;
    try {
      collection = await this.collector.collect(product.externalProductId);
    } catch (error) {
      progress.failedProducts += 1;
      this.logger.warn("Danawa product historical collection failed", {
        source: PRICE_SOURCE.DANAWA,
        externalProductId: product.externalProductId,
        exceptionType: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
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

    const completed = collection.prices.filter(
      price => price.priceYearMonth < currentMonth
    );
    if (!completed.length) {
      progress.failedProducts += 1;
      this.logger.warn("Danawa product has no completed historical prices", {
        source: PRICE_SOURCE.DANAWA,
        externalProductId: product.externalProductId,
        reason: "NO_COMPLETED_MONTHLY_PRICES",
        collectedPrices: collection.prices.length,
        collectedYearMonths: collection.prices.map(price => price.priceYearMonth),
        selectedPeriod: collection.selectedPeriod,
        invalidPrices: collection.invalidCount,
        currentMonth,
      });
      return;
    }
    const writeResult = await this.priceHistories.saveMonthlyPrices(
      upsert.productId,
      PRICE_SOURCE.DANAWA,
      completed
    );
    progress.successfulProducts += 1;
    progress.insertedPrices += writeResult.insertedCount;
    progress.updatedPrices += writeResult.updatedCount;
    progress.skippedPrices += writeResult.skippedCount;
    progress.invalidPrices += collection.invalidCount;
  }
}
