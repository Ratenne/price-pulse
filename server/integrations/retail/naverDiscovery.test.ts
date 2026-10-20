import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeNaverDiscovery,
  requestNaverShoppingDiscovery,
} from "./naverDiscovery";
import { validateRetailDiscoveryCandidate } from "../../domain/retailDiscovery";
import { retailProductInputSchema } from "../../domain/retailProduct";
const payload = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/naver-discovery.json", import.meta.url),
    "utf8"
  )
);
const context = { receivedAt: "2026-10-21T00:00:00Z" };
afterEach(() => vi.unstubAllGlobals());
describe("offline Naver JSON Discovery, source-contract synthetic fixtures", () => {
  it("keeps two sellers sharing nvMid distinct, with shipping unknown and identity unverified", () => {
    const result = normalizeNaverDiscovery(payload, context);
    expect(result.candidates).toHaveLength(2);
    const [a, b] = result.candidates;
    expect(a).toMatchObject({
      kind: "DISCOVERY",
      externalProductId: "70001",
      externalIdKind: "NVMID",
      title: "Test GPU",
      displayedPrice: 100000,
      shippingFee: null,
      shippingFeeKnown: false,
      comparisonPrice: 100000,
      sellerName: "Unit A",
      reviewCount: 12,
      manufacturer: null,
      model: null,
      identificationPossible: false,
      observedAt: null,
      validationStatus: "UNVERIFIED",
    });
    expect(a.candidateKey).not.toBe(b.candidateKey);
    expect(a.priceEvidence).toEqual([
      { field: "discountedSalePrice", value: 100000 },
      { field: "salePrice", value: 110000 },
    ]);
    expect(validateRetailDiscoveryCandidate(a)).toEqual(a);
    expect(retailProductInputSchema.safeParse(a).success).toBe(false);
    expect(result.priceObservationsSaved).toBe(0);
  });
  it("accepts proxy bff-json but does not recover lost ID semantics or treat cache time as observedAt", () => {
    const result = normalizeNaverDiscovery(
      {
        items: [
          {
            product_id: "70001",
            title: "GPU",
            price: "100,000",
            mall_name: "Unit",
            url: "https://shopping.naver.com/catalog/70001",
            source: "bff-json",
          },
        ],
        meta: { extraction: "bff-json", page: 2 },
        proxy: { requested_at: "2026-10-20T00:00:00Z", cache: { hit: true } },
      },
      context
    );
    expect(result.candidates[0]).toMatchObject({
      externalIdKind: "UNVERIFIED_PROXY_ID",
      observedAt: null,
      displayedPrice: 100000,
      shippingFeeKnown: false,
      validationStatus: "UNVERIFIED",
    });
    expect(result.proxyRequestedAt).toBe("2026-10-20T00:00:00Z");
    expect(result.page).toBe(2);
  });
  it("selects only the requested page and labels local sorts as PAGE scope", () => {
    const both = {
      data: [
        ...payload.data,
        {
          page: 2,
          slots: [
            { data: { productNameOrg: "Other", nvMid: "2", salePrice: 1 } },
          ],
        },
      ],
    };
    const sorted = normalizeNaverDiscovery(both, {
      ...context,
      page: 1,
      sort: "price_asc",
    });
    expect(sorted.candidates.map(v => v.displayedPrice)).toEqual([
      99000, 100000,
    ]);
    expect(sorted).toMatchObject({ sortScope: "PAGE", sortApplied: "LOCAL" });
    expect(
      normalizeNaverDiscovery(both, { ...context, page: 2 }).candidates.map(
        v => v.title
      )
    ).toEqual(["Other"]);
    expect(
      normalizeNaverDiscovery(both, { ...context, page: 3 }).candidates
    ).toEqual([]);
    expect(
      normalizeNaverDiscovery(payload, { ...context, sort: "date" }).sortApplied
    ).toBe("UNSUPPORTED");
  });
  it("does not infer shipping, approval, model or identity from provider assertions or a title", () => {
    const candidate = normalizeNaverDiscovery(
      {
        data: [
          {
            slots: [
              {
                data: {
                  productNameOrg: "Brand Model 8GB OC warranty",
                  catalogId: "7",
                  channelProductId: "8",
                  salePrice: 100,
                  shippingFee: 0,
                  shippingFeeKnown: true,
                  approved: true,
                  validationStatus: "APPROVED",
                },
              },
            ],
          },
        ],
      },
      context
    ).candidates[0];
    expect(candidate).toMatchObject({
      externalIdKind: "CATALOG_ID",
      externalIds: { catalogId: "7", channelProductId: "8" },
      shippingFee: null,
      shippingFeeKnown: false,
      model: null,
      validationStatus: "UNVERIFIED",
    });
  });
  it.each(["1.5", "-100", "1만원", "100~200", "", 0, 1.5, 2_000_000_001])(
    "does not coerce ambiguous/invalid price %j into a real amount",
    price => {
      const candidate = normalizeNaverDiscovery(
        {
          data: [
            { slots: [{ data: { productNameOrg: "GPU", salePrice: price } }] },
          ],
        },
        context
      ).candidates[0];
      expect(candidate.displayedPrice).toBeNull();
      expect(candidate.comparisonPrice).toBeNull();
    }
  );
  it("rejects legacy API, HTML fallback, malformed schemas and invalid page metadata", () => {
    for (const invalid of [
      { items: [], meta: { extraction: "naver-openapi" } },
      { items: [], meta: { extraction: "html-card" } },
      { error: "upstream" },
      null,
      { data: {} },
      { data: [{}] },
    ])
      expect(() => normalizeNaverDiscovery(invalid, context)).toThrow();
    expect(
      normalizeNaverDiscovery(
        { items: [], meta: { extraction: "none" } },
        context
      ).candidates
    ).toEqual([]);
    expect(() =>
      normalizeNaverDiscovery(
        { items: [], meta: { extraction: "bff-json", page: 1 } },
        { ...context, page: 2 }
      )
    ).toThrow("DISCOVERY_PAGE_MISMATCH");
  });
  it("preserves reference/coupon evidence without calling it an ordinary verified price", () => {
    const result = normalizeNaverDiscovery(
      {
        data: [
          {
            slots: [
              {
                data: {
                  productNameOrg: "Reference only",
                  originalPrice: 90000,
                },
              },
              {
                data: {
                  productNameOrg: "Coupon card",
                  couponDiscountedPrice: 70000,
                },
              },
            ],
          },
        ],
      },
      context
    );
    expect(result.candidates[0].displayedPrice).toBeNull();
    expect(result.candidates[0].priceEvidence).toEqual([
      { field: "originalPrice", value: 90000 },
    ]);
    expect(result.candidates[1]).toMatchObject({
      displayedPrice: 70000,
      priceMeaning: "CONDITIONAL",
      validationStatus: "UNVERIFIED",
    });
  });
  it("removes dangerous links and ignores unsafe numeric IDs without inventing replacements", () => {
    const candidate = normalizeNaverDiscovery(
      {
        data: [
          {
            slots: [
              {
                data: {
                  productNameOrg: "GPU",
                  nvMid: Number.MAX_SAFE_INTEGER + 1,
                  salePrice: 100,
                  productUrl: { pcUrl: "javascript:alert(1)" },
                  images: [{ imageUrl: "http://127.0.0.1/x" }],
                },
              },
            ],
          },
        ],
      },
      context
    ).candidates[0];
    expect(candidate).toMatchObject({
      externalProductId: null,
      url: null,
      imageUrl: null,
    });
  });
  it("deduplicates exact repeated cards but preserves conflicting price evidence", () => {
    const card = payload.data[0].slots[0];
    const result = normalizeNaverDiscovery(
      {
        data: [
          {
            slots: [
              card,
              card,
              { data: { ...card.data, discountedSalePrice: 1 } },
            ],
          },
        ],
      },
      context
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].candidateKey).toBe(
      result.candidates[1].candidateKey
    );
    expect(result.candidates[0].fingerprint).not.toBe(
      result.candidates[1].fingerprint
    );
  });
  it("keeps all live BFF/proxy requests disabled", async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    await expect(requestNaverShoppingDiscovery()).rejects.toThrow(
      "NAVER_BFF_HTTP_DISABLED"
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
