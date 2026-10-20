import { setTimeout as delay } from "node:timers/promises";
import {
  fetchRetailOffer,
  RetailFetchError,
} from "../integrations/retail/retailClient.js";
import {
  validateObservation,
  type RetailLink,
  type RetailObservation,
} from "../integrations/retail/retailPrice.js";
import type { RetailPriceRepository } from "../repositories/retailPriceRepository.js";
import type { Logger } from "../logging/logger.js";

export async function refreshRetailPrices(
  repository: RetailPriceRepository,
  logger: Logger,
  options: {
    limit?: number;
    delayMs?: number;
    collect?: (link: RetailLink) => Promise<RetailObservation>;
    sleep?: typeof delay;
  } = {}
) {
  const links = await repository.due(options.limit ?? 100);
  const summary = {
    targeted: links.length,
    succeeded: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    blockedSources: [] as string[],
  };
  const blocked = new Set<string>();
  let attempted = false;
  for (const link of links) {
    if (blocked.has(link.source)) {
      summary.skipped++;
      continue;
    }
    if (attempted)
      await (options.sleep ?? delay)(Math.max(1500, options.delayMs ?? 1500));
    attempted = true;
    let offer: RetailObservation;
    try {
      offer = validateObservation(
        link,
        await (options.collect ?? fetchRetailOffer)(link)
      );
    } catch (error) {
      const code =
        error instanceof RetailFetchError
          ? error.code
          : error instanceof Error && error.message === "UNAVAILABLE_OFFER"
            ? "UNAVAILABLE_OFFER"
            : "INVALID_OR_UNAVAILABLE_RESPONSE";
      if (code === "ACCESS_BLOCKED") blocked.add(link.source);
      // DB errors here or on save abort the run; they are never treated as parse failures.
      await repository.failed(link, code);
      summary.failed++;
      logger.warn("Retail collection failed", {
        listingId: link.id,
        source: link.source,
        code,
      });
      continue;
    }
    if (await repository.save(link, offer, "CRAWL")) summary.updated++;
    summary.succeeded++;
  }
  summary.blockedSources = Array.from(blocked);
  logger.info("Retail price refresh finished", { ...summary });
  return summary;
}
