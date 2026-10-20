import type { RetailProductRepository } from "../repositories/retailProductRepository.js";
import type { Logger } from "../logging/logger.js";
import { retailProductInputSchema } from "../domain/retailProduct.js";
import { upsertRetailProducts } from "./retailProductUpsert.js";
import { RetailFetchError } from "../integrations/retail/retailClient.js";
import { checkRetailExecution } from "../integrations/retail/retailPolicy.js";
import {
  createNaverHtmlCollector,
  type NaverCollectorOptions,
} from "../integrations/retail/naverCollector.js";
import {
  naverProductParser,
  type NaverProductParser,
  type NaverHtmlPage,
} from "../integrations/retail/naverParser.js";

export async function refreshNaverProducts(
  repository: RetailProductRepository,
  logger: Logger,
  urls: string[],
  options: NaverCollectorOptions & {
    reviews?: unknown;
    // Trusted server dependencies for fixture/integration verification, never
    // supplied by the HTML, CLI file or approval JSON.
    parser?: NaverProductParser;
    collector?: { collect(url: string): Promise<NaverHtmlPage> };
  } = {}
) {
  const parser = options.parser ?? naverProductParser;
  const collector = options.collector ?? createNaverHtmlCollector(options);
  const summary = {
    targeted: urls.length,
    fetched: 0,
    succeeded: 0,
    created: 0,
    matched: 0,
    updated: 0,
    held: 0,
    failed: 0,
    skipped: 0,
    skipStatuses: { NOT_CONFIGURED: 0, NOT_APPROVED: 0, UNSUPPORTED: 0 },
  };
  const seen = new Set<string>();
  let blocked = false;
  for (const url of urls) {
    const access = checkRetailExecution("NAVER", {
      ...options,
      now: options.clock?.(),
      url,
      method: "CRAWL",
      adapterConfigured: parser.verified,
    });
    if (!access.allowed) {
      summary.skipped++;
      summary.skipStatuses[access.status]++;
      logger.warn("Naver collection skipped", {
        source: "NAVER",
        code: access.code,
        status: access.status,
      });
      continue;
    }
    if (blocked || seen.has(url)) {
      summary.skipped++;
      continue;
    }
    seen.add(url);
    try {
      const page = await collector.collect(url);
      summary.fetched++;
      if (page.url !== url)
        throw new RetailFetchError("INVALID_COLLECTION_PROVENANCE");
      const parsed = parser.parse(page);
      if (parsed.status === "UNSUPPORTED") {
        summary.skipped++;
        summary.skipStatuses.UNSUPPORTED++;
        logger.warn("Naver parser unsupported", {
          source: "NAVER",
          code: parsed.code,
        });
        continue;
      }
      if (parsed.status === "REJECTED") throw new RetailFetchError(parsed.code);
      const input = retailProductInputSchema.safeParse(parsed.input);
      if (
        !input.success ||
        input.data.source !== "NAVER" ||
        input.data.method !== "CRAWL" ||
        input.data.url !== page.url ||
        input.data.dataSource !== page.url ||
        input.data.observedAt !== page.observedAt
      )
        throw new RetailFetchError("INVALID_COLLECTION_PROVENANCE");
      // All identity matching, reviews, holds and transaction behavior remain
      // Phase 2's responsibility. HTML cannot provide a trusted review.
      const result = await upsertRetailProducts(
        repository,
        logger,
        [input.data],
        {
          ...options,
          now: options.clock?.(),
          adapterConfigured: parser.verified,
        }
      );
      for (const key of [
        "created",
        "matched",
        "updated",
        "held",
        "failed",
        "skipped",
      ] as const)
        summary[key] += result[key];
      for (const status of [
        "NOT_CONFIGURED",
        "NOT_APPROVED",
        "UNSUPPORTED",
      ] as const)
        summary.skipStatuses[status] += result.skipStatuses[status];
      summary.succeeded += result.created + result.matched;
    } catch (error) {
      const code =
        error instanceof RetailFetchError
          ? error.code
          : "NAVER_COLLECTION_FAILED";
      if (error instanceof RetailFetchError && error.status) {
        summary.skipped++;
        summary.skipStatuses[error.status]++;
      } else summary.failed++;
      if (
        [
          "AUTHENTICATION_FAILED",
          "ACCESS_BLOCKED",
          "RATE_LIMITED",
          "SOURCE_ACCESS_BLOCKED",
        ].includes(code)
      )
        blocked = true;
      logger.warn("Naver collection not saved", { source: "NAVER", code });
    }
  }
  logger.info("Naver product refresh finished", {
    source: "NAVER",
    ...summary,
  });
  return summary;
}
