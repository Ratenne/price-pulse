import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { naverProductParser, parseNaverProductHtml } from "./naverParser";
import { naverTestUrl } from "./__fixtures__/naverTestSupport";
const page = { url: naverTestUrl, observedAt: "2026-10-20T00:00:00Z" };
describe("Naver parser without a verified permitted product HTML sample", () => {
  it("recognizes the actual access-block excerpt instead of recording stock-out", () => {
    const html = readFileSync(
      new URL(
        "./__fixtures__/naver-search-blocked.excerpt.html",
        import.meta.url
      ),
      "utf8"
    );
    expect(parseNaverProductHtml({ ...page, html })).toEqual({
      status: "REJECTED",
      code: "ACCESS_BLOCKED",
    });
  });
  it("keeps its production verification flag false", () => {
    expect(naverProductParser.verified).toBe(false);
  });
  it.each([
    ["unknown structure", "<html><body>unverified</body></html>"],
    [
      "manufacturer/model asserted by an unverified schema",
      '<script type="application/ld+json">{"@type":"Product","brand":"Test","model":"RTX 5060","offers":{"price":100,"priceCurrency":"KRW"}}</script>',
    ],
    ["missing options", "<body>GPU price 100 shipping 0</body>"],
    ["missing shipping", "<body>GPU price 100</body>"],
    ["conditional price", "<body>회원 쿠폰 가격 100 무료배송</body>"],
    ["unverified stock-out", "<body>품절</body>"],
    [
      "mismatched product information",
      '<body>GPU A</body><script>{"name":"GPU B"}</script>',
    ],
  ])(
    "does not invent extraction for %s (synthetic negative input)",
    (_, html) => {
      expect(parseNaverProductHtml({ ...page, html })).toEqual({
        status: "UNSUPPORTED",
        code: "NAVER_PRODUCT_HTML_UNVERIFIED",
      });
    }
  );
  it("rejects invalid URLs, empty/oversized HTML and invalid observation times", () => {
    for (const invalid of [
      { ...page, html: "" },
      { ...page, html: "가".repeat(700000) },
      { ...page, html: "<body>x</body>", observedAt: "unknown" },
      {
        ...page,
        html: "<body>x</body>",
        url: "https://evil.example/products/1",
      },
    ])
      expect(parseNaverProductHtml(invalid).status).toBe("REJECTED");
  });
});
