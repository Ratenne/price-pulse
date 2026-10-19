import { closeDatabasePool, getDatabasePool } from "../config/database";
import { createDanawaBulkBackfillConfig } from "../config/danawaBackfill";
import { DANAWA_GPU_CATEGORY } from "../integrations/danawa/danawaCategory";
import { DanawaHistoricalPriceCollector } from "../integrations/danawa/danawaHistoricalPriceCollector";
import { DanawaPriceHistoryClient } from "../integrations/danawa/danawaPriceHistoryClient";
import { DanawaProductListClient } from "../integrations/danawa/danawaProductListClient";
import { DanawaRequestPolicy } from "../integrations/danawa/danawaRequestPolicy";
import { consoleLogger } from "../logging/logger";
import { PgPriceHistoryRepository } from "../repositories/priceHistoryRepository";
import { PgProductRepository } from "../repositories/productRepository";
import { DanawaBulkBackfillService } from "../services/danawaBulkBackfillService";

async function main(): Promise<void> {
  const config = createDanawaBulkBackfillConfig();
  const policy = new DanawaRequestPolicy({
    requestDelayMs: config.requestDelayMs,
    retryCount: config.retryCount,
    retryBackoffMs: config.retryBackoffMs,
    timeoutMs: config.requestTimeoutMs,
  });
  const pool = getDatabasePool();
  const service = new DanawaBulkBackfillService(
    new DanawaProductListClient(policy, config.listCount),
    new PgProductRepository(pool),
    new DanawaHistoricalPriceCollector(
      new DanawaPriceHistoryClient({ requestPolicy: policy }),
      consoleLogger
    ),
    new PgPriceHistoryRepository(pool),
    consoleLogger,
    config
  );
  const summary = await service.run(DANAWA_GPU_CATEGORY);
  console.log(
    JSON.stringify({ message: "Danawa bulk backfill completed", summary })
  );
  if (
    summary.failedPages > 0 ||
    summary.failedProducts > 0 ||
    (config.targetHistoricalRowCount > 0 && !summary.targetReached) ||
    (config.targetHistoricalRowCount === 0 && summary.successfulProducts === 0)
  )
    process.exitCode = 2;
}

main()
  .catch(error => {
    console.error(
      JSON.stringify({
        message: "Danawa bulk backfill failed",
        exceptionType: error instanceof Error ? error.name : typeof error,
      })
    );
    process.exitCode = 1;
  })
  .finally(closeDatabasePool);
