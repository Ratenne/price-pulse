import * as cheerio from "cheerio";
import { z } from "zod";
import {
  normalizeName,
  validateObservation,
  type RetailLink,
} from "./retailPrice.js";

// Read a JSON literal, never execute scripts from a retailer page.
export function readJsonAssignment(html: string, variable: string): unknown {
  const start = html.indexOf(`var ${variable} = `);
  if (start < 0) throw new Error("MISSING_PRODUCT_DATA");
  const jsonStart = html.indexOf("{", start);
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = jsonStart; i < html.length; i++) {
    const c = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0)
      return JSON.parse(html.slice(jsonStart, i + 1));
  }
  throw new Error("INVALID_PRODUCT_DATA");
}
const productSchema = z.object({
  prdNo: z.number().int().positive(),
  prdNm: z.string(),
  selPrc: z.number().int().positive(),
  isGroupProduct: z.literal(false),
  isRental: z.literal(false),
  frCtrCd: z.literal(""),
  productLogInfo: z.string(),
});
const logSchema = z.object({
  product_no: z.number().int(),
  product_name: z.string(),
  product_price: z.number().int(),
  product_opt_no: z.literal(0),
  product_type: z.literal("single"),
});
export function parseElevenStreetOffer(
  html: string,
  link: RetailLink,
  now = new Date()
) {
  const $ = cheerio.load(html);
  const p = productSchema.parse(readJsonAssignment(html, "productPrdInfo"));
  const log = logSchema.parse(JSON.parse(p.productLogInfo));
  const deliveryData = z
    .object({
      product_no: z.string(),
      original_price: z.number().int(),
      delivery_fee: z.number().int().nonnegative(),
      delivery_free_price: z.literal(0),
      service_type: z.literal("OM"),
    })
    .parse(readJsonAssignment(html, "brazeProperty"));
  const id = new URL(link.url).pathname.split("/").filter(Boolean).at(-1);
  if (
    String(p.prdNo) !== id ||
    deliveryData.product_no !== id ||
    deliveryData.original_price !== p.selPrc ||
    log.product_no !== p.prdNo ||
    p.selPrc !== log.product_price ||
    normalizeName(p.prdNm) !== normalizeName(log.product_name)
  )
    throw new Error("INCONSISTENT_PRODUCT_DATA");
  if (
    $('input[name="optYn"]').attr("value") !== "N" ||
    $('input[name="insOptCnt"]').attr("value") !== "0"
  )
    throw new Error("UNVERIFIED_OPTIONS");
  const order = /var productOrdInfo = \{([\s\S]*?)\};/.exec(html)?.[1];
  for (const [field, expected] of Object.entries({
    nonMemberBuyYn: "Y",
    ordObjLimit: "N",
    selMinLimitQty: "1",
    buyUntQty: "1",
  })) {
    const values = order?.match(
      new RegExp(`\\b${field}:\\s*"${expected}"`, "g")
    );
    if (values?.length !== 1)
      throw new Error("UNVERIFIED_PURCHASE_ELIGIBILITY");
  }
  const state = $("th")
    .filter((_, el) => $(el).text().trim() === "상품상태")
    .next("td")
    .text()
    .trim();
  if (state !== "새상품") throw new Error("NOT_NEW_PRODUCT");
  const nodes = $('script[type="application/ld+json"]')
    .toArray()
    .flatMap(el => {
      try {
        return [JSON.parse($(el).text())];
      } catch {
        return [];
      }
    });
  const product = nodes.find(
    node => node.productID === id && node["@type"] === "Product"
  );
  if (
    !product ||
    product.offers?.priceCurrency !== "KRW" ||
    product.offers?.price !== p.selPrc ||
    normalizeName(product.name ?? "") !== normalizeName(p.prdNm)
  )
    throw new Error("INCONSISTENT_STRUCTURED_PRICE");
  if (
    !/^https?:\/\/schema\.org\/InStock$/.test(product.offers.availability ?? "")
  )
    throw new Error("UNAVAILABLE_OFFER");
  const delivery = $(".delivery > dt").clone();
  delivery.find("button,.sr-only").remove();
  const text = delivery.text().replace(/\s+/g, " ").trim();
  const fee = /^배송비\s*([\d,]+)원$/.exec(text);
  const shippingFee = fee
    ? Number(fee[1].replaceAll(",", ""))
    : /^(?:배송비\s*)?무료배송$/.test(text)
      ? 0
      : undefined;
  if (shippingFee === undefined || shippingFee !== deliveryData.delivery_fee)
    throw new Error("UNKNOWN_SHIPPING");
  // Use selPrc (ordinary selling price), never finalDscPrc/memberFinalDscPrc or points.
  return validateObservation(
    link,
    {
      listingId: link.id,
      title: p.prdNm,
      itemPrice: p.selPrc,
      shippingFee,
      currency: "KRW",
      condition: "NEW",
      availability: "IN_STOCK",
      conditional: false,
      observedAt: now.toISOString(),
    },
    now
  );
}
