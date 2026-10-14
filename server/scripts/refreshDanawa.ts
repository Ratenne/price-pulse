import { getDatabasePool, closeDatabasePool } from "../config/database.js";
import { createDanawaBulkBackfillConfig } from "../config/danawaBackfill.js";
import { DanawaHistoricalPriceCollector } from "../integrations/danawa/danawaHistoricalPriceCollector.js";
import { DanawaPriceHistoryClient } from "../integrations/danawa/danawaPriceHistoryClient.js";
import { DanawaRequestPolicy } from "../integrations/danawa/danawaRequestPolicy.js";
import { PgPriceHistoryRepository } from "../repositories/priceHistoryRepository.js";
import {
  refreshWeeklyPrices,
  type RefreshProduct,
} from "../services/weeklyPriceRefresh.js";
import { consoleLogger } from "../logging/logger.js";

async function main() {
  const config = createDanawaBulkBackfillConfig();
  const pool = getDatabasePool();
  const rows = await pool.query<RefreshProduct>(
    `SELECT product_id, external_product_id FROM product_source_mappings WHERE source = 'DANAWA' AND source_url LIKE 'https://prod.danawa.com/info/%' ORDER BY id`
  );
  const policy = new DanawaRequestPolicy({
    requestDelayMs: config.requestDelayMs,
    retryCount: config.retryCount,
    retryBackoffMs: config.retryBackoffMs,
    timeoutMs: config.requestTimeoutMs,
  });
  const summary = await refreshWeeklyPrices(
    rows.rows,
    new DanawaHistoricalPriceCollector(
      new DanawaPriceHistoryClient({ requestPolicy: policy }),
      consoleLogger
    ),
    new PgPriceHistoryRepository(pool),
    consoleLogger
  );
  if (summary.successful === 0) process.exitCode = 1;
}
main()
  .catch(error => {
    consoleLogger.error("Weekly Danawa refresh failed", {
      exceptionType: error instanceof Error ? error.name : typeof error,
    });
    process.exitCode = 1;
  })
  .finally(closeDatabasePool);
