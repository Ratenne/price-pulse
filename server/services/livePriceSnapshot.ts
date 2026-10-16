import type { LivePrices } from "../integrations/danawa/danawaLivePrices.js";
import type { Logger } from "../logging/logger";
import type { LivePriceSnapshotRepository } from "../repositories/livePriceSnapshotRepository";

// If a crawl returns far fewer listings than we track, treat it as suspect and
// keep the previous prices rather than blanking products Danawa still lists.
const MIN_COVERAGE_TO_CLEAR_MISSING = 0.5;

export interface LivePriceSnapshotSummary {
  tracked: number;
  fetched: number;
  updated: number;
  cleared: number;
  clearSkipped: boolean;
}

export async function refreshLivePriceSnapshot(
  fetchPrices: () => Promise<LivePrices>,
  repository: LivePriceSnapshotRepository,
  logger: Logger
): Promise<LivePriceSnapshotSummary> {
  // fetchPrices throws on any failed page, so a partial crawl never reaches the DB.
  const live = await fetchPrices();
  const tracked = await repository.countMappedProducts();
  const { updated } = await repository.applyPrices(live.prices, live.checkedAt);
  const covered =
    tracked > 0 && live.prices.size >= tracked * MIN_COVERAGE_TO_CLEAR_MISSING;
  const clearSkipped = !covered;
  let cleared = 0;
  if (covered) {
    ({ cleared } = await repository.clearMissing(
      Array.from(live.prices.keys()),
      live.checkedAt
    ));
  } else {
    logger.warn("Live price coverage too low; kept previous prices", {
      tracked,
      fetched: live.prices.size,
    });
  }
  const summary = {
    tracked,
    fetched: live.prices.size,
    updated,
    cleared,
    clearSkipped,
  };
  logger.info("Live price snapshot refreshed", { ...summary });
  return summary;
}
