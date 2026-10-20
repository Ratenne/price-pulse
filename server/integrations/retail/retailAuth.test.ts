import { describe, expect, it } from "vitest";
import { createCoupangAuthorization } from "./coupangAuth";
import { createEsmAuthorization } from "./esmAuth";
const now = new Date("2026-10-20T01:02:03Z");
const coupang = {
  RETAIL_COUPANG_ACCESS_KEY: "unit-access",
  RETAIL_COUPANG_SECRET_KEY: "unit-secret",
  RETAIL_COUPANG_VENDOR_ID: "A000TEST",
};
const request = {
  method: "GET" as const,
  path: "/v2/providers/seller_api/apis/api/v1/marketplace/seller-products",
  query: "vendorId=A000TEST&maxPerPage=10",
};
const esm = {
  RETAIL_ESM_MASTER_ID: "test-master",
  RETAIL_ESM_SECRET_KEY: "unit-esm-secret",
  RETAIL_ESM_ISSUER: "test.example",
  RETAIL_GMARKET_SELLER_ID: "gmkt-test",
  RETAIL_AUCTION_SELLER_ID: "auction-test",
};
describe("offline vendor authentication primitives", () => {
  it("matches an independently computed Coupang HMAC vector in UTC", () => {
    expect(createCoupangAuthorization(request, coupang, now)).toBe(
      "CEA algorithm=HmacSHA256, access-key=unit-access, signed-date=261020T010203Z, signature=94671f7b2102893d01da580167a095d81aff06e95d60e47394097384160a4bc7"
    );
  });
  it("signs exact query bytes and requires all seller credentials", () => {
    expect(
      createCoupangAuthorization(
        { ...request, query: "maxPerPage=10&vendorId=A000TEST" },
        coupang,
        now
      )
    ).not.toBe(createCoupangAuthorization(request, coupang, now));
    for (const key of Object.keys(coupang))
      expect(() =>
        createCoupangAuthorization(request, { ...coupang, [key]: "" }, now)
      ).toThrow("MISSING_CREDENTIALS");
    expect(() =>
      createCoupangAuthorization(
        request,
        { ...coupang, RETAIL_COUPANG_ACCESS_KEY: "inject\r\nheader" },
        now
      )
    ).toThrow("INVALID_AUTH_CONFIGURATION");
  });
  it("matches an independent ESM HS256 vector without sharing seller identities", () => {
    const jwt = createEsmAuthorization("GMARKET", esm, now);
    expect(jwt).toBe(
      "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3QtbWFzdGVyIn0.eyJpc3MiOiJ0ZXN0LmV4YW1wbGUiLCJzdWIiOiJzZWxsIiwiYXVkIjoic2EuZXNtcGx1cy5jb20iLCJpYXQiOjE3OTI0NTgxMjMsInNzaSI6Ikc6Z21rdC10ZXN0In0.YHKCxHmXcRAS_3TjSDH31uXi_9dYeCML-78d-vNiD_I"
    );
    const auction = createEsmAuthorization("AUCTION", esm, now);
    const claims = JSON.parse(
      Buffer.from(auction.slice(7).split(".")[1], "base64url").toString("utf8")
    );
    expect(claims.ssi).toBe("A:auction-test");
    expect(auction).not.toContain("gmkt-test");
    expect(claims).not.toHaveProperty("exp");
  });
  it("does not substitute the other marketplace's seller ID", () => {
    expect(() =>
      createEsmAuthorization(
        "AUCTION",
        { ...esm, RETAIL_AUCTION_SELLER_ID: "" },
        now
      )
    ).toThrow("MISSING_CREDENTIALS");
    expect(() =>
      createEsmAuthorization(
        "GMARKET",
        { ...esm, RETAIL_GMARKET_SELLER_ID: "gmkt,A:other" },
        now
      )
    ).toThrow("INVALID_AUTH_CONFIGURATION");
    expect(() =>
      createEsmAuthorization(
        "GMARKET",
        { ...esm, RETAIL_ESM_SECRET_KEY: "" },
        now
      )
    ).toThrow("MISSING_CREDENTIALS");
  });
});
