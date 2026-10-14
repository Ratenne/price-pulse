import { closeDatabasePool } from "../config/database";
import { createHistoricalPriceBackfillService } from "../services/createHistoricalPriceBackfillService";

async function main(): Promise<void> {
  const productId = process.argv[2]?.trim();
  if (!productId) {
    throw new Error(
      "Usage: pnpm run backfill:danawa -- <PricePulse productId>"
    );
  }

  const service = createHistoricalPriceBackfillService();
  await service.backfillDanawa(productId);
}

main()
  .catch(error => {
    const exceptionType = error instanceof Error ? error.name : typeof error;
    console.error(
      JSON.stringify({
        level: "error",
        message: "Danawa backfill command failed",
        exceptionType,
      })
    );
    process.exitCode = 1;
  })
  .finally(closeDatabasePool);
