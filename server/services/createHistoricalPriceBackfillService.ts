import { getDatabasePool } from "../config/database";
import { DanawaHistoricalPriceCollector } from "../integrations/danawa/danawaHistoricalPriceCollector";
import { DanawaPriceHistoryClient } from "../integrations/danawa/danawaPriceHistoryClient";
import { consoleLogger } from "../logging/logger";
import { PgPriceHistoryRepository } from "../repositories/priceHistoryRepository";
import { PgProductSourceMappingRepository } from "../repositories/productSourceMappingRepository";
import { HistoricalPriceBackfillService } from "./historicalPriceBackfillService";

export function createHistoricalPriceBackfillService(): HistoricalPriceBackfillService {
  const pool = getDatabasePool();
  const mappings = new PgProductSourceMappingRepository(pool);
  const priceHistories = new PgPriceHistoryRepository(pool);
  const client = new DanawaPriceHistoryClient();
  const collector = new DanawaHistoricalPriceCollector(client, consoleLogger);
  return new HistoricalPriceBackfillService(
    mappings,
    collector,
    priceHistories,
    consoleLogger
  );
}
