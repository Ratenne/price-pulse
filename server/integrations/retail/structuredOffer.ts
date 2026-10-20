import * as cheerio from "cheerio";
import type { RetailLink, RetailObservation } from "./retailPrice.js";
import { normalizeName, validateObservation } from "./retailPrice.js";

type Node = Record<string, unknown>;
const object = (v: unknown): v is Node =>
  !!v && typeof v === "object" && !Array.isArray(v);
const schemaValue = (v: unknown, expected: string) =>
  typeof v === "string" &&
  [
    expected,
    `https://schema.org/${expected}`,
    `http://schema.org/${expected}`,
  ].includes(v);
function integer(v: unknown): number | undefined {
  if (typeof v !== "number" && (typeof v !== "string" || !/^\d+$/.test(v)))
    return;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}
function products(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(products);
  if (!object(value)) return [];
  const types = Array.isArray(value["@type"])
    ? value["@type"]
    : [value["@type"]];
  return [
    ...(types.some(t => schemaValue(t, "Product")) ? [value] : []),
    ...products(value["@graph"]),
  ];
}

// Only explicit, single-variant KRW offers with known Korean shipping qualify.
// AggregateOffer.lowPrice and meta prices cannot establish a payable total.
export function parseStructuredOffer(
  html: string,
  link: RetailLink,
  now = new Date()
): RetailObservation {
  const $ = cheerio.load(html);
  const found: Node[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      found.push(...products(JSON.parse($(el).text())));
    } catch {
      /* Other malformed scripts are irrelevant. */
    }
  });
  const matched = found.filter(
    p =>
      typeof p.name === "string" &&
      normalizeName(p.name) === normalizeName(link.listingName)
  );
  if (matched.length !== 1) throw new Error("MISSING_OR_AMBIGUOUS_PRODUCT");
  const product = matched[0];
  const offers = Array.isArray(product.offers)
    ? product.offers
    : [product.offers];
  if (offers.length !== 1 || !object(offers[0]))
    throw new Error("AMBIGUOUS_OFFER");
  const offer = offers[0];
  if (
    ["OutOfStock", "SoldOut", "Discontinued"].some(status =>
      schemaValue(offer.availability, status)
    )
  )
    throw new Error("UNAVAILABLE_OFFER");
  if (
    !schemaValue(offer["@type"], "Offer") ||
    !schemaValue(offer.availability, "InStock") ||
    !schemaValue(
      offer.itemCondition ?? product.itemCondition,
      "NewCondition"
    ) ||
    offer.priceCurrency !== "KRW"
  )
    throw new Error("INELIGIBLE_OFFER");
  if (
    offer.eligibleCustomerType ||
    offer.eligibleQuantity ||
    offer.eligibleTransactionVolume ||
    offer.priceSpecification
  )
    throw new Error("CONDITIONAL_OR_UNVERIFIED_PRICE");
  if (
    offer.validFrom &&
    (typeof offer.validFrom !== "string" ||
      !(Date.parse(offer.validFrom) <= now.getTime()))
  )
    throw new Error("OFFER_NOT_STARTED");
  if (
    offer.priceValidUntil &&
    (typeof offer.priceValidUntil !== "string" ||
      !(
        Date.parse(
          offer.priceValidUntil.length === 10
            ? `${offer.priceValidUntil}T23:59:59+09:00`
            : offer.priceValidUntil
        ) >= now.getTime()
      ))
  )
    throw new Error("EXPIRED_OFFER");
  const details = Array.isArray(offer.shippingDetails)
    ? offer.shippingDetails
    : [offer.shippingDetails];
  // Regional, conditional or quantity-dependent rates require a reviewed feed.
  if (details.length !== 1 || !object(details[0]))
    throw new Error("UNKNOWN_SHIPPING");
  const shipping = details[0];
  const destination = shipping.shippingDestination;
  const rate = shipping.shippingRate;
  if (
    !object(destination) ||
    destination.addressCountry !== "KR" ||
    destination.addressRegion ||
    destination.postalCode ||
    !object(rate) ||
    rate.currency !== "KRW" ||
    shipping.shippingConditions ||
    shipping.doesNotShip === true
  )
    throw new Error("UNKNOWN_SHIPPING");
  return validateObservation(
    link,
    {
      listingId: link.id,
      title: product.name,
      itemPrice: integer(offer.price),
      shippingFee: integer(rate.value),
      currency: "KRW",
      condition: "NEW",
      availability: "IN_STOCK",
      conditional: false,
      observedAt: now.toISOString(),
    },
    now
  );
}
