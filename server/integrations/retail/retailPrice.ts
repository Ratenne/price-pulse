import { z } from "zod";
import { RETAILERS, type Retailer } from "../../../shared/retailPrices.js";

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
    shippingFee: money,
    currency: z.literal("KRW"),
    condition: z.literal("NEW"),
    availability: z.literal("IN_STOCK"),
    conditional: z.literal(false),
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(
    v => v.itemPrice + v.shippingFee <= 2_000_000_000,
    "Total exceeds supported range"
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
