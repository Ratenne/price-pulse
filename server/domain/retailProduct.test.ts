import { describe, expect, it } from "vitest";
import {
  inputIdentity,
  normalizeRetailIdentity,
  retailIdentityKey,
  retailProductInputSchema,
  reviewIdentityMatches,
  sameRetailIdentity,
  type RetailIdentity,
  type RetailProductReview,
} from "./retailProduct";
const identity: RetailIdentity = {
  manufacturer: "GIGABYTE",
  model: "RTX 5060",
  mpn: "GV-N5060",
  variants: { memory: "8GB", overclock: "OC", bundle: "card only" },
  distributor: "피씨디렉트",
  warranty: "3 year domestic",
};
const review: RetailProductReview = {
  source: "11ST",
  externalProductId: "1",
  approvalStatus: "approved",
  action: "CREATE",
  category: "GPU",
  productName: "Reviewed GPU",
  identity,
  requiredOptionKeys: ["memory", "overclock", "bundle"],
  reviewedBy: "reviewer",
  reviewedAt: "2026-10-20T00:00:00Z",
  evidence: "test-only",
};
const now = new Date("2026-10-20T01:00:00Z");
describe("retail product identity", () => {
  it("normalizes whitespace/case and key order without erasing punctuation or digits", () => {
    const equivalent = {
      ...identity,
      manufacturer: "  gigabyte ",
      model: "RTX  5060",
      variants: { bundle: "card only", overclock: "oc", memory: "8gb" },
    };
    expect(sameRetailIdentity(identity, equivalent)).toBe(true);
    expect(retailIdentityKey(identity)).toBe(retailIdentityKey(equivalent));
    expect(
      sameRetailIdentity(identity, { ...identity, model: "RTX-5060" })
    ).toBe(false);
    expect(normalizeRetailIdentity(identity).mpn).toBe("gv-n5060");
  });
  it.each([
    { model: "RTX 5060 Ti" },
    { manufacturer: "MSI" },
    { mpn: "GV-N5060-OTHER" },
    { distributor: "제이씨현" },
    { warranty: "overseas" },
    { variants: { ...identity.variants, memory: "16GB" } },
    { variants: { ...identity.variants, overclock: "non-OC" } },
    { variants: { ...identity.variants, bundle: "two cards" } },
  ])("keeps differing identity fields separate: %o", patch => {
    expect(sameRetailIdentity(identity, { ...identity, ...patch })).toBe(false);
  });
  it("compares MPN only when supplied and never fabricates it", () => {
    const { mpn, ...without } = identity;
    expect(sameRetailIdentity(identity, without)).toBe(true);
    expect(normalizeRetailIdentity(without)).not.toHaveProperty("mpn");
  });
  it("binds a server review to the observed identity and declared required options", () => {
    expect(reviewIdentityMatches(review, identity, now)).toBe(true);
    expect(
      reviewIdentityMatches(
        { ...review, reviewedAt: "2027-01-01T00:00:00Z" },
        identity,
        now
      )
    ).toBe(false);
    expect(
      reviewIdentityMatches(
        { ...review, requiredOptionKeys: ["memory", "missing"] },
        identity,
        now
      )
    ).toBe(false);
    expect(
      reviewIdentityMatches(review, { ...identity, model: "RTX 5060 Ti" }, now)
    ).toBe(false);
  });
  it("preserves unknown fields as absent and rejects a provider approval flag", () => {
    const minimal = {
      source: "11ST",
      externalProductId: "1",
      title: "GPU",
      url: "https://www.11st.co.kr/products/1",
      method: "IMPORT",
      dataSource: "test",
      availability: "OUT_OF_STOCK",
    };
    const parsed = retailProductInputSchema.parse(minimal);
    expect(parsed).not.toHaveProperty("shippingFee");
    expect(inputIdentity(parsed).success).toBe(false);
    expect(
      retailProductInputSchema.safeParse({ ...minimal, approved: true }).success
    ).toBe(false);
  });
});
