import { getDatabasePool } from "../config/database";
import { DanawaHistoricalPriceCollector } from "../integrations/danawa/danawaHistoricalPriceCollector";
import { DanawaPriceHistoryClient } from "../integrations/danawa/danawaPriceHistoryClient";
import { consoleLogger } from "../logging/logger";
import { PgPriceHistoryRepository } from "../repositories/priceHistoryRepository";
import { PgProductSourceMappingRepository } from "../repositories/productSourceMappingRepository";
import { HistoricalPriceBackfillService } from "./historicalPriceBackfillService";
import { PgLivePriceSnapshotRepository } from "../repositories/livePriceSnapshotRepository";
import { readSelectedLivePrices } from "../integrations/danawa/danawaLivePrices";
import { refreshLivePriceSnapshot } from "./livePriceSnapshot";

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
    consoleLogger,
    async (productId, externalProductId) => {
      const product = await pool.query<{ name: string }>(
        "SELECT name FROM products WHERE id=$1",
        [productId]
      );
      if (!product.rows[0]) throw new Error("PRODUCT_NOT_FOUND");
      const summary = await refreshLivePriceSnapshot(
        () =>
          readSelectedLivePrices([
            {
              external_product_id: externalProductId,
              name: product.rows[0].name,
            },
          ]),
        new PgLivePriceSnapshotRepository(pool),
        consoleLogger,
        [externalProductId]
      );
      return summary.failed === 0;
    }
  );
}
