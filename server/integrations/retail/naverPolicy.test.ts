import { describe, expect, it } from "vitest";
import { checkRetailExecution, checkRetailPolicy } from "./retailPolicy";
import {
  naverTestOptions,
  naverTestPolicy,
  naverTestUrl,
  naverTestNow,
} from "./__fixtures__/naverTestSupport";
describe("Naver CRAWL approval reuses the retail policy", () => {
  const check = (policy: unknown, url = naverTestUrl) =>
    checkRetailExecution("NAVER", {
      ...naverTestOptions,
      now: naverTestNow,
      url,
      policies: { NAVER: policy },
      method: "CRAWL",
      adapterConfigured: true,
    });
  it("keeps runtime configuration pending even when enabled", () => {
    expect(
      checkRetailExecution("NAVER", {
        env: { RETAIL_NAVER_ENABLED: "true" },
        method: "CRAWL",
        url: naverTestUrl,
        adapterConfigured: true,
      })
    ).toMatchObject({ allowed: false, status: "NOT_APPROVED" });
  });
  it("requires all crawl evidence and an exact reviewed URL", () => {
    expect(check(naverTestPolicy).allowed).toBe(true);
    expect(check({ ...naverTestPolicy, crawl: undefined }).allowed).toBe(false);
    for (const key of [
      "automaticAccessAllowed",
      "robotsVerified",
      "parserVerified",
      "databaseVerified",
      "environmentVerified",
    ])
      expect(
        check({
          ...naverTestPolicy,
          crawl: { ...naverTestPolicy.crawl, [key]: false },
        }).allowed
      ).toBe(false);
    for (const url of [
      "https://smartstore.naver.com/other/products/123",
      naverTestUrl + "?x=1",
      "https://shopping.naver.com/catalog/123",
    ])
      expect(check(naverTestPolicy, url).allowed).toBe(false);
  });
  it("cannot revive other retailer HTML paths or an unimplemented Naver parser", () => {
    expect(
      checkRetailPolicy("11ST", "CRAWL", {
        policies: { "11ST": naverTestPolicy },
        now: naverTestNow,
        url: naverTestUrl,
      }).allowed
    ).toBe(false);
    expect(
      checkRetailExecution("NAVER", {
        ...naverTestOptions,
        now: naverTestNow,
        url: naverTestUrl,
        method: "CRAWL",
        adapterConfigured: false,
      })
    ).toMatchObject({
      allowed: false,
      status: "UNSUPPORTED",
      code: "NAVER_PRODUCT_HTML_UNVERIFIED",
    });
  });
});
