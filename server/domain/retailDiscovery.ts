import { createHash } from "node:crypto";
import { z } from "zod";
import { collectionSchema } from "../integrations/retail/retailPrice.js";

const text = z.string().trim().min(1).max(1000);
const money = z.number().int().positive().max(2_000_000_000);
// Search evidence, deliberately NOT a RetailProductInput/price observation.
export const retailDiscoveryCandidateSchema = z
  .object({
    kind: z.literal("DISCOVERY"),
    source: collectionSchema.shape.source,
    candidateKey: text,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    externalProductId: text.nullable(),
    externalIdKind: z.enum([
      "NVMID",
      "CATALOG_ID",
      "CHANNEL_PRODUCT_ID",
      "UNVERIFIED_PROXY_ID",
      "UNKNOWN",
    ]),
    externalIds: z.record(text, text),
    title: text,
    displayedPrice: money.nullable(),
    shippingFee: z.number().int().min(0).max(2_000_000_000).nullable(),
    shippingFeeKnown: z.boolean(),
    comparisonPrice: money.nullable(),
    sellerName: text.nullable(),
    sellerId: text.nullable(),
    url: z.string().url().nullable(),
    imageUrl: z.string().url().nullable(),
    category: z.array(text).max(5),
    reviewCount: z.number().int().nonnegative().nullable(),
    manufacturer: text.nullable(),
    model: text.nullable(),
    identificationPossible: z.boolean(),
    identityStatus: z.literal("UNVERIFIED"),
    priceMeaning: z.enum(["UNVERIFIED", "CONDITIONAL"]),
    priceEvidence: z
      .array(
        z
          .object({
            field: text,
            value: z.union([z.string().max(100), z.number(), z.null()]),
          })
          .strict()
      )
      .max(20),
    format: z.enum(["NAVER_BFF_JSON", "K_SKILL_PROXY_JSON"]),
    dataSource: z.string().url(),
    observedAt: z.string().datetime({ offset: true }).nullable(),
    receivedAt: z.string().datetime({ offset: true }),
    validationStatus: z.literal("UNVERIFIED"),
  })
  .strict()
  .refine(v => v.shippingFeeKnown === (v.shippingFee !== null));
export type RetailDiscoveryCandidate = z.infer<
  typeof retailDiscoveryCandidateSchema
>;
type CandidateFields = Omit<
  RetailDiscoveryCandidate,
  "candidateKey" | "fingerprint"
>;
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function retailDiscoveryKey(v: CandidateFields) {
  return `${v.source}_DISCOVERY:${hash({
    externalIdKind: v.externalIdKind,
    externalIds: v.externalIds,
    sellerName: v.sellerName,
    sellerId: v.sellerId,
    url: v.url,
    title: v.externalProductId ? undefined : v.title,
  })}`;
}
export function retailDiscoveryFingerprint(v: CandidateFields) {
  const { receivedAt, ...evidence } = v;
  return hash(evidence);
}
export function createRetailDiscoveryCandidate(
  fields: CandidateFields
): RetailDiscoveryCandidate {
  const candidate = retailDiscoveryCandidateSchema.parse({
    ...fields,
    candidateKey: retailDiscoveryKey(fields),
    fingerprint: retailDiscoveryFingerprint(fields),
  });
  // Hash the schema's canonical property order; caller object ordering is not evidence.
  const { candidateKey, fingerprint, ...canonical } = candidate;
  return {
    ...candidate,
    candidateKey: retailDiscoveryKey(canonical),
    fingerprint: retailDiscoveryFingerprint(canonical),
  };
}
export function validateRetailDiscoveryCandidate(raw: unknown) {
  const candidate = retailDiscoveryCandidateSchema.parse(raw);
  const { candidateKey, fingerprint, ...canonical } = candidate;
  if (
    candidateKey !== retailDiscoveryKey(canonical) ||
    fingerprint !== retailDiscoveryFingerprint(canonical)
  )
    throw new Error("DISCOVERY_EVIDENCE_CHANGED");
  return candidate;
}
