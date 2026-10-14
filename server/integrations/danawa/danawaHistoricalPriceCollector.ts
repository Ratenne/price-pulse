import type {
  HistoricalPriceCollection,
  HistoricalPriceCollector,
} from "../../domain/historicalPrice";
import type { Logger } from "../../logging/logger";
import { DanawaPriceHistoryClient } from "./danawaPriceHistoryClient";
import { parseDanawaMonthlyPrices } from "./danawaPriceHistoryParser";

export class DanawaHistoricalPriceCollector
  implements HistoricalPriceCollector
{
  constructor(
    private readonly client: DanawaPriceHistoryClient,
    private readonly logger: Pick<Logger, "warn">
  ) {}

  async collect(externalProductId: string): Promise<HistoricalPriceCollection> {
    const response = await this.client.fetchPriceHistory(externalProductId);
    return parseDanawaMonthlyPrices(response, this.logger);
  }
}
