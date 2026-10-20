import type { HistoricalPriceCollector } from "../domain/historicalPrice";
import { koreaYearMonth } from "../domain/priceCalendar.js";
import {
  completedHistoricalCollection,
  collectionFailure,
} from "../domain/priceCollection";
import type { PriceHistoryRepository } from "../repositories/priceHistoryRepository";
import type { Logger } from "../logging/logger";

export interface RefreshProduct {
  product_id: string;
  external_product_id: string;
}

export async function refreshWeeklyPrices(
  products: RefreshProduct[],
  collector: HistoricalPriceCollector,
  repository: Pick<
    PriceHistoryRepository,
    "saveMonthlyPrices" | "recordStatus"
  >,
  logger: Logger,
  now = new Date()
) {
  const currentMonth = koreaYearMonth(now);
  const summary = {
    processed: 0,
    successful: 0,
    failed: 0,
    noSourceData: 0,
    insufficientHistory: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    currentMonth,
  };
  const seen = new Set<string>();
  for (const product of products) {
    if (seen.has(product.product_id)) continue;
    seen.add(product.product_id);
    summary.processed++;
    let collection;
    try {
      collection = await collector.collect(product.external_product_id);
    } catch (error) {
      summary.failed++;
      await repository.recordStatus(product.product_id, {
        status: "COLLECTION_FAILED",
        reason: collectionFailure(error),
        checkedAt: new Date().toISOString(),
      });
      logger.warn("Weekly Danawa product failed", {
        externalProductId: product.external_product_id,
        exceptionType: error instanceof Error ? error.name : typeof error,
        failureStage: collectionFailure(error),
      });
      continue;
    }
    const resultStatus = completedHistoricalCollection(collection, now);
    // A persistence failure is fatal: do not keep calling Danawa with a broken DB.
    const result = await repository.saveMonthlyPrices(
      product.product_id,
      "DANAWA",
      resultStatus.prices
    );
    await repository.recordStatus(product.product_id, {
      ...resultStatus,
      checkedAt: new Date().toISOString(),
    });
    if (resultStatus.status === "COLLECTION_FAILED") summary.failed++;
    else summary.successful++;
    if (resultStatus.status === "NO_SOURCE_DATA") summary.noSourceData++;
    if (resultStatus.status === "INSUFFICIENT_HISTORY")
      summary.insufficientHistory++;
    summary.inserted += result.insertedCount;
    summary.updated += result.updatedCount;
    summary.skipped += result.skippedCount;
    if (summary.processed % 30 === 0)
      logger.info("Weekly Danawa progress", { ...summary });
  }
  logger.info("Weekly Danawa completed", { ...summary });
  return summary;
}
