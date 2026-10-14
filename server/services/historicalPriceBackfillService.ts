import {
  PRICE_SOURCE,
  type HistoricalPriceCollector,
} from "../domain/historicalPrice";
import { DanawaIntegrationError } from "../integrations/danawa/danawaErrors";
import type { Logger } from "../logging/logger";
import type { PriceHistoryRepository } from "../repositories/priceHistoryRepository";
import type { ProductSourceMappingRepository } from "../repositories/productSourceMappingRepository";

export class ProductSourceMappingNotFoundError extends Error {
  constructor(productId: string) {
    super(`No Danawa productCode is mapped to PricePulse product ${productId}`);
    this.name = "ProductSourceMappingNotFoundError";
  }
}

export interface HistoricalPriceBackfillResult {
  productId: string;
  externalProductId: string;
  source: "DANAWA";
  receivedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
}

export class HistoricalPriceBackfillService {
  constructor(
    private readonly mappings: ProductSourceMappingRepository,
    private readonly collector: HistoricalPriceCollector,
    private readonly priceHistories: PriceHistoryRepository,
    private readonly logger: Logger
  ) {}

  async backfillDanawa(
    productId: string
  ): Promise<HistoricalPriceBackfillResult> {
    let externalProductId: string | undefined;
    try {
      externalProductId = await this.mappings.findExternalProductId(
        productId,
        PRICE_SOURCE.DANAWA
      );
      if (!externalProductId) {
        throw new ProductSourceMappingNotFoundError(productId);
      }

      const collection = await this.collector.collect(externalProductId);
      const writeResult = await this.priceHistories.saveMonthlyPrices(
        productId,
        PRICE_SOURCE.DANAWA,
        collection.prices
      );
      const result: HistoricalPriceBackfillResult = {
        productId,
        externalProductId,
        source: PRICE_SOURCE.DANAWA,
        receivedCount: collection.receivedCount,
        insertedCount: writeResult.insertedCount,
        updatedCount: writeResult.updatedCount,
        skippedCount: collection.invalidCount + writeResult.skippedCount,
      };

      this.logger.info("Historical price backfill completed", { ...result });
      return result;
    } catch (error) {
      this.logger.error("Historical price backfill failed", {
        source: PRICE_SOURCE.DANAWA,
        productId,
        externalProductId,
        failureStage:
          error instanceof DanawaIntegrationError
            ? error.stage
            : "DATABASE_OR_APPLICATION",
        httpStatus:
          error instanceof DanawaIntegrationError ? error.status : undefined,
        exceptionType: error instanceof Error ? error.name : typeof error,
      });
      throw error;
    }
  }
}
