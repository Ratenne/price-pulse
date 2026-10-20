import { setTimeout as delay } from "node:timers/promises";
import { RetailFetchError } from "../integrations/retail/retailClient.js";
import {
  collectionObservation,
  type RetailLink,
  type RetailObservation,
  type RetailCollection,
} from "../integrations/retail/retailPrice.js";
import type { RetailPriceRepository } from "../repositories/retailPriceRepository.js";
import {
  checkRetailExecution,
  type RetailPolicies,
} from "../integrations/retail/retailPolicy.js";
import type { Logger } from "../logging/logger.js";

export async function refreshRetailPrices(
  repository: RetailPriceRepository,
  logger: Logger,
  options: {
    limit?: number;
    delayMs?: number;
    collect?: (link: RetailLink) => Promise<RetailCollection>;
    policies?: RetailPolicies;
    env?: NodeJS.ProcessEnv;
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
    skipStatuses: { NOT_CONFIGURED: 0, NOT_APPROVED: 0, UNSUPPORTED: 0 },
  };
  const blocked = new Set<string>();
  let attempted = false;
  const requests = new Map<string, number>();
  let previousDelay = 1500;
  for (const link of links) {
    if (blocked.has(link.source)) {
      summary.skipped++;
      continue;
    }
    const access = checkRetailExecution(link.source, {
      ...options,
      method: "API",
      adapterConfigured: !!options.collect,
    });
    if (!access.allowed) {
      summary.skipped++;
      summary.skipStatuses[access.status]++;
      logger.warn("Retail collection skipped", {
        listingId: link.id,
        source: link.source,
        code: access.code,
        status: access.status,
      });
      continue;
    }
    if ((requests.get(link.source) ?? 0) >= access.policy.maxRequestsPerRun) {
      summary.skipped++;
      logger.warn("Retail collection skipped", {
        listingId: link.id,
        source: link.source,
        code: "SOURCE_RUN_LIMIT",
      });
      continue;
    }
    const requestDelay = Math.max(
      1500,
      options.delayMs ?? 1500,
      access.policy.minDelayMs
    );
    if (attempted)
      await (options.sleep ?? delay)(Math.max(previousDelay, requestDelay));
    previousDelay = requestDelay;
    requests.set(link.source, (requests.get(link.source) ?? 0) + 1);
    attempted = true;
    let offer: RetailObservation;
    try {
      const collected = await options.collect!(link);
      if (collected.method !== "API")
        throw new RetailFetchError("INVALID_COLLECTION_METHOD");
      offer = collectionObservation(link, collected);
    } catch (error) {
      const code =
        error instanceof RetailFetchError
          ? error.code
          : error instanceof Error && error.message === "UNAVAILABLE_OFFER"
            ? "UNAVAILABLE_OFFER"
            : "INVALID_OR_UNAVAILABLE_RESPONSE";
      if (
        [
          "ACCESS_BLOCKED",
          "AUTHENTICATION_FAILED",
          "PERMISSION_DENIED",
          "RATE_LIMITED",
        ].includes(code)
      )
        blocked.add(link.source);
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
    if (await repository.save(link, offer, "IMPORT")) summary.updated++;
    summary.succeeded++;
  }
  summary.blockedSources = Array.from(blocked);
  logger.info("Retail price refresh finished", { ...summary });
  return summary;
}
