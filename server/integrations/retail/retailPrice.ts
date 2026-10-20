import { z } from "zod";
import {
  RETAILERS,
  retailComparisonPrice,
  type Retailer,
} from "../../../shared/retailPrices.js";

const HOSTS: Record<Retailer, string[]> = {
  COUPANG: ["www.coupang.com"],
  "11ST": ["www.11st.co.kr"],
  GMARKET: ["item.gmarket.co.kr"],
  AUCTION: ["itempage3.auction.co.kr"],
  NAVER: ["smartstore.naver.com", "brand.naver.com", "shopping.naver.com"],
};
export function validateRetailUrl(source: Retailer, value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !HOSTS[source]?.includes(url.hostname)
  )
    throw new Error("UNSUPPORTED_RETAIL_URL");
  const paths: Record<Retailer, RegExp> = {
    COUPANG: /^\/vp\/products\/\d+\/?$/,
    "11ST": /^\/products\/\d+\/?$/,
    GMARKET: /^\/Item\/?$/i,
    AUCTION: /^\/DetailView\.aspx$/i,
    NAVER: /^(?:\/[^/]+\/products\/\d+|\/catalog\/\d+)\/?$/,
  };
  if (
    !paths[source].test(url.pathname) ||
    (source === "GMARKET" &&
      !/^\d+$/.test(
        Array.from(url.searchParams).find(
          ([k]) => k.toLowerCase() === "goodscode"
        )?.[1] ?? ""
      )) ||
    (source === "AUCTION" &&
      !/^[a-z]?\d+$/i.test(
        Array.from(url.searchParams).find(
          ([k]) => k.toLowerCase() === "itemno"
        )?.[1] ?? ""
      ))
  )
    throw new Error("EXPECTED_PRODUCT_URL");
  return url;
}
const separators = new RegExp("[\\s\\p{P}\\p{S}]+", "gu");
export const normalizeName = (name: string) =>
  name.normalize("NFKC").toLowerCase().replace(separators, "");
const money = z.number().int().min(0).max(2_000_000_000);
export const linkSchema = z
  .object({
    productId: z.string().min(1).max(80),
    productName: z.string().min(1).max(500),
    source: z.enum(Object.keys(RETAILERS) as [Retailer, ...Retailer[]]),
    url: z.string().url(),
    // An operator must verify the exact model, memory, OC and local warranty variant.
    listingName: z.string().min(1).max(500),
  })
  .strict()
  .superRefine((v, ctx) => {
    try {
      validateRetailUrl(v.source, v.url);
    } catch {
      ctx.addIssue({ code: "custom", message: "Unsupported product URL" });
    }
  });
export type RetailLink = z.infer<typeof linkSchema> & {
  id: number;
  version: number;
};
export const observationSchema = z
  .object({
    listingId: z.number().int().positive(),
    title: z.string().min(1).max(500),
    itemPrice: money.refine(v => v > 0),
    shippingFee: money.nullable(),
    displayedPrice: money
      .refine(v => v > 0)
      .nullable()
      .optional(),
    currency: z.literal("KRW"),
    condition: z.literal("NEW"),
    availability: z.literal("IN_STOCK"),
    conditional: z.literal(false),
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(
    v => retailComparisonPrice(v) !== null,
    "Verified comparison price required"
  );
export type RetailObservation = z.infer<typeof observationSchema>;
export function validateObservation(
  link: RetailLink,
  input: unknown,
  now = new Date()
): RetailObservation {
  const v = observationSchema.parse(input);
  const age = now.getTime() - Date.parse(v.observedAt);
  if (
    v.listingId !== link.id ||
    normalizeName(v.title) !== normalizeName(link.listingName)
  )
    throw new Error("MODEL_OR_VARIANT_MISMATCH");
  if (age < -60_000 || age >= 12 * 3_600_000)
    throw new Error("STALE_OR_FUTURE_OBSERVATION");
  if (
    /중고|리퍼|벌크|해외|직구|렌탈|대여|할부|쿠폰|회원|카드|used|refurb|renewed|coupon|membership/i.test(
      v.title
    )
  )
    throw new Error("EXCLUDED_PURCHASE_CONDITION");
  return v;
}

// Normalized provider contract: reuse observation and link fields; missing
// provider data stays absent. Persistence still requires a complete observation.
export const collectionSchema = z
  .object({
    ...observationSchema.partial().shape,
    source: linkSchema.shape.source,
    url: z.string().url(),
    externalProductId: z.string().trim().min(1),
    manufacturer: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    method: z.enum(["API", "IMPORT", "CRAWL"]),
    dataSource: z.string().trim().min(1),
  })
  .strict();
export type RetailCollection = z.infer<typeof collectionSchema>;
export function collectionObservation(
  link: RetailLink,
  input: RetailCollection
) {
  input = collectionSchema.parse(input);
  if (
    input.source !== link.source ||
    input.url !== link.url ||
    !input.externalProductId?.trim() ||
    !input.dataSource?.trim()
  )
    throw new Error("INVALID_COLLECTION_PROVENANCE");
  const {
    source,
    url,
    externalProductId,
    manufacturer,
    model,
    method,
    dataSource,
    ...observation
  } = input;
  return validateObservation(link, observation);
}

// Phase 2 also records explicit stock-out observations. Unknown amounts stay NULL.
export type RetailStoredObservation = Omit<
  RetailObservation,
  "availability" | "itemPrice" | "shippingFee"
> & {
  availability: "IN_STOCK" | "OUT_OF_STOCK";
  itemPrice: number | null;
  shippingFee: number | null;
};
const storedObservationSchema = z
  .object({
    ...observationSchema.shape,
    availability: z.enum(["IN_STOCK", "OUT_OF_STOCK"]),
    itemPrice: money.refine(v => v > 0).nullable(),
    shippingFee: money.nullable(),
  })
  .strict()
  .refine(
    v =>
      v.availability === "OUT_OF_STOCK" ||
      (v.itemPrice !== null && retailComparisonPrice(v) !== null)
  )
  .refine(
    v =>
      v.itemPrice === null ||
      v.shippingFee === null ||
      v.itemPrice + v.shippingFee <= 2_000_000_000
  );
export function validateStoredRetailObservation(
  link: RetailLink,
  input: unknown,
  now = new Date()
): RetailStoredObservation {
  const v = storedObservationSchema.parse(input);
  if (v.availability === "IN_STOCK") return validateObservation(link, v, now);
  const age = now.getTime() - Date.parse(v.observedAt);
  if (
    v.listingId !== link.id ||
    normalizeName(v.title) !== normalizeName(link.listingName)
  )
    throw new Error("MODEL_OR_VARIANT_MISMATCH");
  if (age < -60_000 || age >= 12 * 3_600_000)
    throw new Error("STALE_OR_FUTURE_OBSERVATION");
  if (
    /중고|리퍼|벌크|해외|직구|렌탈|대여|할부|쿠폰|회원|카드|used|refurb|renewed|coupon|membership/i.test(
      v.title
    )
  )
    throw new Error("EXCLUDED_PURCHASE_CONDITION");
  return v;
}
