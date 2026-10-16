import { getDatabasePool, closeDatabasePool } from "../config/database.js";
import { fetchLivePrices } from "../integrations/danawa/danawaLivePrices.js";
import { PgLivePriceSnapshotRepository } from "../repositories/livePriceSnapshotRepository.js";
import { refreshLivePriceSnapshot } from "../services/livePriceSnapshot.js";
import { consoleLogger } from "../logging/logger.js";

async function main() {
  const summary = await refreshLivePriceSnapshot(
    () => fetchLivePrices(),
    new PgLivePriceSnapshotRepository(getDatabasePool()),
    consoleLogger
  );
  if (summary.updated === 0) process.exitCode = 1;
}
main()
  .catch(error => {
    consoleLogger.error("Live price snapshot refresh failed", {
      exceptionType: error instanceof Error ? error.name : typeof error,
    });
    process.exitCode = 1;
  })
  .finally(closeDatabasePool);
