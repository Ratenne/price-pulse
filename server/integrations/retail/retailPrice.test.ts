import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseElevenStreetOffer } from "./elevenStreetOffer";
import { parseStructuredOffer } from "./structuredOffer";
import { fetchRetailOffer } from "./retailClient";
import {
  validateObservation,
  validateRetailUrl,
  type RetailLink,
  validateStoredRetailObservation,
} from "./retailPrice";

const link: RetailLink = {
  id: 1,
  version: 1,
  productId: "danawa-90889865",
  source: "11ST",
  productName: "GIGABYTE 지포스 RTX 5060 WINDFORCE OC D7 8GB 피씨디렉트",
  listingName: "GIGABYTE 지포스 RTX 5060 WINDFORCE OC D7 8GB 피씨디렉트",
  url: "https://www.11st.co.kr/products/8620117214",
};
const now = new Date("2026-10-19T00:00:00Z");
const fixture = readFileSync(
  new URL("./fixtures/11st-product.html", import.meta.url),
  "utf8"
);
const observed = {
  listingId: 1,
  title: link.listingName,
  itemPrice: 882700,
  shippingFee: 3000,
  currency: "KRW",
  condition: "NEW",
  availability: "IN_STOCK",
  conditional: false,
  observedAt: now.toISOString(),
};
describe("reviewed retail prices", () => {
  it("accepts shipping NULL only with separately verified displayed-price evidence", () => {
    expect(
      validateObservation(
        link,
        { ...observed, shippingFee: null, displayedPrice: 880000 },
        now
      )
    ).toMatchObject({ shippingFee: null, displayedPrice: 880000 });
    expect(() =>
      validateObservation(link, { ...observed, shippingFee: null }, now)
    ).toThrow();
    expect(() =>
      validateObservation(
        link,
        { ...observed, shippingFee: null, displayedPrice: 0 },
        now
      )
    ).toThrow();
    expect(
      validateStoredRetailObservation(
        link,
        {
          ...observed,
          availability: "OUT_OF_STOCK",
          itemPrice: null,
          shippingFee: null,
        },
        now
      )
    ).toMatchObject({ availability: "OUT_OF_STOCK", shippingFee: null });
  });
  it("extracts ordinary price plus shipping from the reduced real 11st response", () => {
    expect(parseElevenStreetOffer(fixture, link, now)).toEqual(observed);
    // Lower member/coupon prices must never replace selPrc.
    expect(
      parseElevenStreetOffer(
        fixture.replace(
          '"isRental": false',
          '"memberFinalDscPrc": 1, "isRental": false'
        ),
        link,
        now
      ).itemPrice
    ).toBe(882700);
  });
  it.each([
    ['selMinLimitQty: "1"', 'selMinLimitQty: "10"'],
    ['nonMemberBuyYn: "Y"', 'nonMemberBuyYn: "N"'],
    ['"frCtrCd": ""', '"frCtrCd": "US"'],
    ['name="optYn" value="N"', 'name="optYn" value="Y"'],
    ["새상품", "중고"],
    ["배송비 3,000원", "배송비 착불"],
    ['"delivery_fee": 3000', '"delivery_fee": 0'],
    ['"delivery_free_price": 0', '"delivery_free_price": 50000'],
    ['"isGroupProduct": false', '"isGroupProduct": true'],
  ])("rejects unverifiable product conditions (%s)", (a, b) => {
    expect(() =>
      parseElevenStreetOffer(fixture.replace(a, b), link, now)
    ).toThrow();
  });
  it("checks exact model, memory and distributor", () => {
    for (const title of [
      link.listingName.replace("8GB", "16GB"),
      link.listingName.replace("피씨디렉트", "제이씨현"),
      link.listingName.replace("5060", "5060 Ti"),
    ])
      expect(() =>
        validateObservation(link, { ...observed, title }, now)
      ).toThrow("MODEL_OR_VARIANT_MISMATCH");
  });
  it("rejects missing shipping, conditional discounts, expired and future observations", () => {
    for (const patch of [
      { shippingFee: undefined },
      { conditional: true },
      { observedAt: "2026-10-18T00:00:00Z" },
      { observedAt: "2026-10-20T00:00:00Z" },
      { itemPrice: 0 },
      { shippingFee: -1 },
      { currency: "USD" },
    ])
      expect(() =>
        validateObservation(link, { ...observed, ...patch }, now)
      ).toThrow();
  });
  it("restricts requests to known HTTPS product pages and rejects internal hosts", () => {
    for (const url of [
      "http://www.11st.co.kr/products/1",
      "https://www.11st.co.kr.evil.test/products/1",
      "https://127.0.0.1/products/1",
      "https://user:pass@www.11st.co.kr/products/1",
      "https://www.11st.co.kr/search",
    ])
      expect(() => validateRetailUrl("11ST", url)).toThrow();
    expect(
      validateRetailUrl(
        "GMARKET",
        "https://item.gmarket.co.kr/Item?goodsCode=4419190669"
      ).hostname
    ).toBe("item.gmarket.co.kr");
    expect(
      validateRetailUrl(
        "AUCTION",
        "https://itempage3.auction.co.kr/DetailView.aspx?ItemNo=F280791259"
      ).hostname
    ).toBe("itempage3.auction.co.kr");
  });
  it("disables the legacy HTML entry point before making any request", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("Denied", { status: 403 }));
    await expect(fetchRetailOffer(link, fetchFn)).rejects.toThrow(
      "HTML_COLLECTION_DISABLED"
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("rejects a sold out 11st offer", () => {
    expect(() =>
      parseElevenStreetOffer(
        fixture.replaceAll("schema.org/InStock", "schema.org/OutOfStock"),
        link,
        now
      )
    ).toThrow("UNAVAILABLE_OFFER");
  });
});
describe("conservative schema.org fallback for the other four retailers", () => {
  const product = {
    "@type": "Product",
    name: link.listingName,
    itemCondition: "https://schema.org/NewCondition",
    offers: {
      "@type": "Offer",
      price: 100000,
      priceCurrency: "KRW",
      availability: "https://schema.org/InStock",
      shippingDetails: {
        shippingDestination: { addressCountry: "KR" },
        shippingRate: { currency: "KRW", value: 2500 },
      },
    },
  };
  const html = (p: unknown) =>
    `<script type="application/ld+json">${JSON.stringify(p)}</script>`;
  it("accepts only explicit shipping and a single matched variant", () => {
    expect(parseStructuredOffer(html(product), link, now)).toMatchObject({
      itemPrice: 100000,
      shippingFee: 2500,
    });
  });
  it("does not guess delivery costs or use AggregateOffer.lowPrice", () => {
    for (const p of [
      { ...product, offers: { ...product.offers, shippingDetails: undefined } },
      { ...product, offers: { "@type": "AggregateOffer", lowPrice: 1 } },
      { ...product, offers: [product.offers, product.offers] },
      {
        ...product,
        offers: { ...product.offers, priceSpecification: { price: 1 } },
      },
    ])
      expect(() => parseStructuredOffer(html(p), link, now)).toThrow();
  });
});
