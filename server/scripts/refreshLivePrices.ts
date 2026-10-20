import { getDatabasePool, closeDatabasePool } from "../config/database.js";
import {
  fetchLivePrices,
  readSelectedLivePrices,
} from "../integrations/danawa/danawaLivePrices.js";
import { PgLivePriceSnapshotRepository } from "../repositories/livePriceSnapshotRepository.js";
import { refreshLivePriceSnapshot } from "../services/livePriceSnapshot.js";
import { consoleLogger } from "../logging/logger.js";

async function main() {
  const repository = new PgLivePriceSnapshotRepository(getDatabasePool());
  const missing = process.argv.includes("--missing-history")
    ? await repository.findProductsWithoutHistory()
    : undefined;
  const summary = await refreshLivePriceSnapshot(
    () => (missing ? readSelectedLivePrices(missing) : fetchLivePrices()),
    repository,
    consoleLogger,
    missing?.map(p => p.external_product_id)
  );
  if (summary.failed > 0) process.exitCode = 2;
}
main()
  .catch(error => {
    consoleLogger.error("Live price snapshot refresh failed", {
      exceptionType: error instanceof Error ? error.name : typeof error,
    });
    process.exitCode = 1;
  })
  .finally(closeDatabasePool);
