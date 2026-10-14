import type { HistoricalPriceCollector } from "../domain/historicalPrice";
import { koreaYearMonth } from "../domain/priceCalendar.js";
import type { PriceHistoryRepository } from "../repositories/priceHistoryRepository";
import type { Logger } from "../logging/logger";

export interface RefreshProduct {
  product_id: string;
  external_product_id: string;
}

export async function refreshWeeklyPrices(
  products: RefreshProduct[],
  collector: HistoricalPriceCollector,
  repository: Pick<PriceHistoryRepository, "saveMonthlyPrices">,
  logger: Logger,
  now = new Date()
) {
  const currentMonth = koreaYearMonth(now);
  const summary = {
    processed: 0,
    successful: 0,
    failed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    currentMonth,
  };
  for (const product of products) {
    summary.processed++;
    let collection;
    try {
      collection = await collector.collect(product.external_product_id);
    } catch (error) {
      summary.failed++;
      logger.warn("Weekly Danawa product failed", {
        externalProductId: product.external_product_id,
        exceptionType: error instanceof Error ? error.name : typeof error,
      });
      continue;
    }
    const completed = collection.prices.filter(
      p => p.priceYearMonth < currentMonth
    );
    if (!completed.length) {
      summary.failed++;
      continue;
    }
    // A persistence failure is fatal: do not keep calling Danawa with a broken DB.
    const result = await repository.saveMonthlyPrices(
      product.product_id,
      "DANAWA",
      completed
    );
    summary.successful++;
    summary.inserted += result.insertedCount;
    summary.updated += result.updatedCount;
    summary.skipped += result.skippedCount;
    if (summary.processed % 30 === 0)
      logger.info("Weekly Danawa progress", { ...summary });
  }
  logger.info("Weekly Danawa completed", { ...summary });
  return summary;
}
