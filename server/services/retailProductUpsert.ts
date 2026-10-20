import { z } from "zod";
import reviews from "../../config/retail-product-reviews.json";
import {
  retailProductInputSchema,
  retailProductReviewSchema,
  type RetailProductReview,
} from "../domain/retailProduct.js";
import {
  checkRetailExecution,
  type RetailPolicies,
} from "../integrations/retail/retailPolicy.js";
import type { RetailProductRepository } from "../repositories/retailProductRepository.js";
import type { Logger } from "../logging/logger.js";

export async function upsertRetailProducts(
  repository: RetailProductRepository,
  logger: Logger,
  inputs: unknown[],
  options: {
    reviews?: unknown;
    policies?: RetailPolicies;
    env?: NodeJS.ProcessEnv;
    adapterConfigured?: boolean;
    now?: Date;
  } = {}
) {
  const verifiedReviews = z
    .array(retailProductReviewSchema)
    .parse(options.reviews ?? reviews);
  const byListing = new Map<string, RetailProductReview>();
  for (const review of verifiedReviews) {
    const key = `${review.source}:${review.externalProductId}`;
    if (byListing.has(key)) throw new Error("DUPLICATE_PRODUCT_REVIEW");
    byListing.set(key, review);
  }
  const summary = {
    targeted: inputs.length,
    created: 0,
    matched: 0,
    updated: 0,
    held: 0,
    failed: 0,
    skipped: 0,
    skipStatuses: { NOT_CONFIGURED: 0, NOT_APPROVED: 0, UNSUPPORTED: 0 },
  };
  for (const raw of inputs) {
    const parsed = retailProductInputSchema.safeParse(raw);
    if (!parsed.success) {
      summary.failed++;
      logger.warn("Retail product input rejected", {
        code: "INVALID_PRODUCT_INPUT",
      });
      continue;
    }
    const input = parsed.data;
    const access = checkRetailExecution(input.source, {
      ...options,
      method: input.method,
      adapterConfigured:
        input.method === "IMPORT" || options.adapterConfigured === true,
    });
    if (!access.allowed) {
      summary.skipped++;
      summary.skipStatuses[access.status]++;
      logger.warn("Retail product input skipped", {
        source: input.source,
        externalProductId: input.externalProductId,
        code: access.code,
        status: access.status,
      });
      continue;
    }
    try {
      const result = await repository.upsert(
        input,
        byListing.get(`${input.source}:${input.externalProductId}`),
        options.now
      );
      if (result.status === "HELD") {
        summary.held++;
        logger.warn("Retail product requires review", {
          source: input.source,
          externalProductId: input.externalProductId,
          reason: result.reason,
          candidates: result.candidates,
        });
      } else {
        if (result.status === "CREATED") summary.created++;
        else summary.matched++;
        if (result.updated) summary.updated++;
      }
    } catch (error) {
      summary.failed++;
      // Do not log API payloads, credentials, SQL values or raw provider errors.
      logger.warn("Retail product transaction failed", {
        source: input.source,
        externalProductId: input.externalProductId,
        code:
          error instanceof Error && error.message === "OBSERVATION_CONFLICT"
            ? "OBSERVATION_CONFLICT"
            : "PRODUCT_TRANSACTION_FAILED",
      });
    }
  }
  logger.info("Retail product batch finished", { ...summary });
  return summary;
}
