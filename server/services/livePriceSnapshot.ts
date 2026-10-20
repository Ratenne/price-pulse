import type { LivePrices } from "../integrations/danawa/danawaLivePrices.js";
import { collectionFailure } from "../domain/priceCollection";
import type { Logger } from "../logging/logger";
import type { LivePriceSnapshotRepository } from "../repositories/livePriceSnapshotRepository";

export async function refreshLivePriceSnapshot(
  fetchPrices: () => Promise<LivePrices>,
  repository: LivePriceSnapshotRepository,
  logger: Logger,
  targetExternalIds?: string[]
) {
  const tracked =
    targetExternalIds?.length ?? (await repository.countMappedProducts());
  let live: LivePrices;
  try {
    live = await fetchPrices();
  } catch (error) {
    await repository.recordUnobserved(
      [],
      new Date().toISOString(),
      collectionFailure(error),
      targetExternalIds
    );
    throw error;
  }
  const { updated } = await repository.applyPrices(
    live.prices,
    live.checkedAt,
    live.details
  );
  let failed = 0;
  const handled = Array.from(live.prices.keys());
  for (const [externalId, reason] of Array.from(live.failures ?? [])) {
    if (targetExternalIds && !targetExternalIds.includes(externalId)) continue;
    const result = await repository.recordUnobserved(
      [],
      live.checkedAt,
      reason,
      [externalId]
    );
    failed += result.failed;
    handled.push(externalId);
  }
  const remainder = await repository.recordUnobserved(
    handled,
    live.checkedAt,
    "NOT_OBSERVED_IN_VALID_LIST",
    targetExternalIds
  );
  failed += remainder.failed;
  const summary = { tracked, fetched: live.prices.size, updated, failed };
  if (failed)
    logger.warn("Current prices not reconfirmed; previous values preserved", {
      ...summary,
    });
  logger.info("Live price snapshot refreshed", { ...summary });
  return summary;
}
