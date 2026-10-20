import { createHash } from "node:crypto";
import { z } from "zod";
import {
  collectionSchema,
  validateRetailUrl,
} from "../integrations/retail/retailPrice.js";

const text = z.string().trim().min(1).max(500);
export const retailIdentitySchema = z
  .object({
    manufacturer: text,
    model: text,
    mpn: text.optional(),
    gtin: z
      .string()
      .regex(/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/)
      .optional(),
    variants: z.record(text, text).refine(v => Object.keys(v).length > 0),
    distributor: text,
    warranty: text,
  })
  .strict();
export type RetailIdentity = z.infer<typeof retailIdentitySchema>;
export const retailProductInputSchema = collectionSchema
  .extend({
    title: text,
    externalProductId: text,
    availability: z.enum(["IN_STOCK", "OUT_OF_STOCK"]),
    mpn: text.optional(),
    gtin: retailIdentitySchema.shape.gtin,
    variants: z.record(text, text).optional(),
    distributor: text.optional(),
    warranty: text.optional(),
  })
  .superRefine((v, ctx) => {
    try {
      validateRetailUrl(v.source, v.url);
    } catch {
      ctx.addIssue({ code: "custom", message: "UNSUPPORTED_RETAIL_URL" });
    }
  });
export type RetailProductInput = z.infer<typeof retailProductInputSchema>;
export const retailProductReviewSchema = z
  .object({
    source: collectionSchema.shape.source,
    externalProductId: text,
    approvalStatus: z.literal("approved"),
    action: z.enum(["MATCH", "CREATE"]),
    productId: z
      .string()
      .regex(/^[\w-]{1,80}$/)
      .optional(),
    productName: text.optional(),
    category: z.enum(["GPU", "CPU", "LAPTOP"]).optional(),
    identity: retailIdentitySchema,
    requiredOptionKeys: z.array(text).min(1),
    reviewedBy: text,
    reviewedAt: z.string().datetime({ offset: true }),
    evidence: text,
  })
  .strict()
  .superRefine((review, ctx) => {
    if (
      (review.action === "MATCH" && !review.productId) ||
      (review.action === "CREATE" && review.productId)
    )
      ctx.addIssue({
        code: "custom",
        message: "MATCH requires productId; CREATE must omit it",
      });
  });
export type RetailProductReview = z.infer<typeof retailProductReviewSchema>;

// Preserve punctuation and digits: model differences must not normalize away.
const normalize = (v: string) =>
  v.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export function normalizeRetailIdentity(
  identity: RetailIdentity
): RetailIdentity {
  return {
    manufacturer: normalize(identity.manufacturer),
    model: normalize(identity.model),
    ...(identity.mpn ? { mpn: normalize(identity.mpn) } : {}),
    ...(identity.gtin ? { gtin: identity.gtin } : {}),
    variants: Object.fromEntries(
      Object.entries(identity.variants)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => [key, normalize(value)])
    ),
    distributor: normalize(identity.distributor),
    warranty: normalize(identity.warranty),
  };
}
export function retailIdentityKey(identity: RetailIdentity): string {
  const { mpn, gtin, ...core } = normalizeRetailIdentity(identity);
  return createHash("sha256").update(JSON.stringify(core)).digest("hex");
}
export function sameRetailIdentity(a: RetailIdentity, b: RetailIdentity) {
  const left = normalizeRetailIdentity(a),
    right = normalizeRetailIdentity(b);
  return (
    retailIdentityKey(left) === retailIdentityKey(right) &&
    !(left.mpn && right.mpn && left.mpn !== right.mpn) &&
    !(left.gtin && right.gtin && left.gtin !== right.gtin)
  );
}
export function inputIdentity(input: RetailProductInput) {
  return retailIdentitySchema.safeParse({
    manufacturer: input.manufacturer,
    model: input.model,
    mpn: input.mpn,
    gtin: input.gtin,
    variants: input.variants,
    distributor: input.distributor,
    warranty: input.warranty,
  });
}
export function reviewIdentityMatches(
  review: RetailProductReview,
  identity: RetailIdentity,
  now: Date
) {
  return (
    Date.parse(review.reviewedAt) <= now.getTime() &&
    sameRetailIdentity(review.identity, identity) &&
    review.requiredOptionKeys.every(key => !!identity.variants[key])
  );
}
export function canonicalRetailCategory(
  category: string
): "GPU" | "CPU" | "LAPTOP" | undefined {
  if (category === "PC 주요 부품_그래픽카드") return "GPU";
  return category === "GPU" || category === "CPU" || category === "LAPTOP"
    ? category
    : undefined;
}

// Shared official identifiers cannot silently create another core identity for
// the same manufacturer/variant/distribution/warranty scope.
export function sameRetailIdentifierScope(
  a: RetailIdentity,
  b: RetailIdentity
) {
  const left = normalizeRetailIdentity(a),
    right = normalizeRetailIdentity(b);
  const sameOptions =
    JSON.stringify(left.variants) === JSON.stringify(right.variants) &&
    left.distributor === right.distributor &&
    left.warranty === right.warranty;
  return (
    sameOptions &&
    ((!!left.mpn &&
      left.mpn === right.mpn &&
      left.manufacturer === right.manufacturer) ||
      (!!left.gtin && left.gtin === right.gtin))
  );
}
