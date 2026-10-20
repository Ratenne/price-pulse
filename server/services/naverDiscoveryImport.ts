import { z } from "zod";
import verifications from "../../config/naver-discovery-verifications.json";
import { retailIdentitySchema } from "../domain/retailProduct.js";
import {
  validateRetailDiscoveryCandidate,
  type RetailDiscoveryCandidate,
} from "../domain/retailDiscovery.js";
import {
  checkRetailExecution,
  type RetailPolicies,
} from "../integrations/retail/retailPolicy.js";
import { validateNaverTargetUrl } from "../integrations/retail/naverTarget.js";
import type { RetailDiscoveryRepository } from "../repositories/retailProductRepository.js";
import type { Logger } from "../logging/logger.js";
import { upsertRetailProducts } from "./retailProductUpsert.js";

const text = z.string().trim().min(1).max(500);
const money = z.number().int().positive().max(2_000_000_000);
// Trusted SERVER verification, not a flag supplied by a search result. Product
// CREATE/MATCH approval still comes from the existing Phase 2 review structure.
export const naverDiscoveryVerificationSchema = z
  .object({
    candidateKey: text,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    sellerId: text.max(100),
    sellerProductId: text.max(100),
    idNamespace: z.enum([
      "SMARTSTORE_CHANNEL_PRODUCT",
      "BRANDSTORE_CHANNEL_PRODUCT",
    ]),
    url: z.string().url(),
    identity: retailIdentitySchema,
    itemPrice: money,
    displayedPrice: money,
    shippingFee: z.number().int().min(0).max(2_000_000_000).nullable(),
    currency: z.literal("KRW"),
    condition: z.literal("NEW"),
    conditional: z.literal(false),
    availability: z.enum(["IN_STOCK", "OUT_OF_STOCK"]),
    sourceVerified: z.literal(true),
    priceMeaningVerified: z.literal(true),
    observationTimeVerified: z.literal(true),
    observedAt: z.string().datetime({ offset: true }),
    reviewedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    reviewedBy: text,
    evidence: text,
  })
  .strict()
  .refine(v => {
    try {
      const target = validateNaverTargetUrl(v.url);
      return (
        target.hostname ===
        (v.idNamespace === "SMARTSTORE_CHANNEL_PRODUCT"
          ? "smartstore.naver.com"
          : "brand.naver.com")
      );
    } catch {
      return false;
    }
  });
export type NaverDiscoveryVerification = z.infer<
  typeof naverDiscoveryVerificationSchema
>;
export function naverVerifiedListingId(v: NaverDiscoveryVerification) {
  // Verified ID namespace + seller is part of the external key, never nvMid or
  // a catalog ID alone. This is not a new product matching algorithm.
  return [v.idNamespace, v.sellerId, v.sellerProductId]
    .map(encodeURIComponent)
    .join(":");
}
function qualifies(
  candidate: RetailDiscoveryCandidate,
  v: NaverDiscoveryVerification | undefined,
  now: Date
) {
  return (
    v &&
    candidate.priceMeaning !== "CONDITIONAL" &&
    candidate.displayedPrice !== null &&
    candidate.displayedPrice === v.displayedPrice &&
    (candidate.observedAt === null || candidate.observedAt === v.observedAt) &&
    now.getTime() - Date.parse(v.observedAt) >= -60000 &&
    now.getTime() - Date.parse(v.observedAt) < 12 * 3600000 &&
    Date.parse(v.reviewedAt) >= Date.parse(v.observedAt) &&
    Date.parse(v.reviewedAt) <= now.getTime() &&
    Date.parse(v.expiresAt) > now.getTime()
  );
}
export async function importNaverDiscovery(
  repository: RetailDiscoveryRepository,
  logger: Logger,
  inputs: unknown[],
  options: {
    policies?: RetailPolicies;
    env?: NodeJS.ProcessEnv;
    now?: Date;
    verifications?: unknown;
    reviews?: unknown;
  } = {}
) {
  const checks = z
    .array(naverDiscoveryVerificationSchema)
    .parse(options.verifications ?? verifications);
  const verified = new Map<string, NaverDiscoveryVerification>();
  for (const v of checks) {
    const key = `${v.candidateKey}:${v.fingerprint}`;
    if (verified.has(key)) throw new Error("DUPLICATE_DISCOVERY_VERIFICATION");
    verified.set(key, v);
  }
  const now = options.now ?? new Date();
  const summary = {
    targeted: inputs.length,
    created: 0,
    matched: 0,
    updated: 0,
    held: 0,
    failed: 0,
    skipped: 0,
  };
  const variants = new Map<string, Set<string>>();
  for (const raw of inputs) {
    try {
      const c = validateRetailDiscoveryCandidate(raw);
      const seen = variants.get(c.candidateKey) ?? new Set<string>();
      seen.add(c.fingerprint);
      variants.set(c.candidateKey, seen);
    } catch {
      /* Invalid candidates are rejected below, without DB access. */
    }
  }
  for (const raw of inputs) {
    let candidate: RetailDiscoveryCandidate;
    try {
      candidate = validateRetailDiscoveryCandidate(raw);
      if (candidate.source !== "NAVER")
        throw new Error("INVALID_DISCOVERY_SOURCE");
    } catch {
      summary.failed++;
      logger.warn("Discovery candidate rejected", {
        source: "NAVER",
        code: "INVALID_DISCOVERY_CANDIDATE",
      });
      continue;
    }
    const access = checkRetailExecution("NAVER", {
      ...options,
      method: "IMPORT",
      adapterConfigured: true,
    });
    if (
      !access.allowed ||
      !access.policy.discovery?.dataSources.includes(candidate.dataSource)
    ) {
      summary.skipped++;
      logger.warn("Discovery import skipped", {
        source: "NAVER",
        code: access.allowed ? "DISCOVERY_SOURCE_NOT_APPROVED" : access.code,
      });
      continue;
    }
    try {
      const v = verified.get(
        `${candidate.candidateKey}:${candidate.fingerprint}`
      );
      if (
        (variants.get(candidate.candidateKey)?.size ?? 0) > 1 ||
        !qualifies(candidate, v, now)
      ) {
        await repository.holdCandidate(
          {
            source: "NAVER",
            externalProductId: candidate.candidateKey,
            title: candidate.title,
          },
          "DISCOVERY_VERIFICATION_REQUIRED"
        );
        summary.held++;
        continue;
      }
      const checked = v!;
      const result = await upsertRetailProducts(
        repository,
        logger,
        [
          {
            source: "NAVER",
            externalProductId: naverVerifiedListingId(checked),
            url: checked.url,
            title: candidate.title,
            ...checked.identity,
            itemPrice: checked.itemPrice,
            shippingFee: checked.shippingFee,
            displayedPrice: checked.displayedPrice,
            currency: checked.currency,
            condition: checked.condition,
            conditional: checked.conditional,
            availability: checked.availability,
            observedAt: checked.observedAt,
            // The data was supplied as a reviewed artifact, not fetched by this importer.
            method: "IMPORT",
            dataSource: candidate.dataSource,
          },
        ],
        { ...options, now, discoveryCandidateKey: candidate.candidateKey }
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
    } catch {
      summary.failed++;
      logger.warn("Discovery import failed", {
        source: "NAVER",
        code: "DISCOVERY_TRANSACTION_FAILED",
      });
    }
  }
  logger.info("Naver discovery import finished", {
    source: "NAVER",
    ...summary,
  });
  return summary;
}
