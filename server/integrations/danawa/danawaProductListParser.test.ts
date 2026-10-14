import { describe, expect, it } from "vitest";
import {
  calculateTotalPages,
  deduplicateDiscoveredProducts,
  parseDanawaProductList,
} from "./danawaProductListParser";

const FIXTURE = `
  <input type="hidden" id="totalProductCount" value="908" />
  <input type="hidden" id="productCodeListForContent" value="87687467,999" />
  <ul>
    <li class="prod_item" id="productItem87687467">
      <a href="https://prod.danawa.com/info/?pcode=87687467&cate=112753" name="productName">
        PNY 지포스 RTX 5060 Ti OC D7 16GB Dual Fan STCOM
      </a>
      <input id="productItem_categoryInfo_87687467" value="PC 주요 부품_그래픽카드" />
      <input id="min_price_87687467" value="827,000" />
      <dl class="meta_item mt_date">25.04. 등록</dl>
    </li>
    <li class="prod_item prod_ad_item" id="adSmartProduct_999">
      <a href="https://prod.danawa.com/info/?pcode=999" name="productName">광고 상품</a>
    </li>
  </ul>`;

describe("parseDanawaProductList", () => {
  it("parses non-ad product fields and pagination", () => {
    const result = parseDanawaProductList(FIXTURE, 1, 30);
    expect(result.totalPages).toBe(31);
    expect(result.products).toEqual([
      {
        externalProductId: "87687467",
        name: "PNY 지포스 RTX 5060 Ti OC D7 16GB Dual Fan STCOM",
        category: "PC 주요 부품_그래픽카드",
        sourceUrl: "https://prod.danawa.com/info/?pcode=87687467&cate=112753",
        currentMinPrice: 827_000,
        registeredYearMonth: "2025-04",
      },
    ]);
  });

  it("calculates 31 pages for 908 products at 30 per page", () => {
    expect(calculateTotalPages(908, 30)).toBe(31);
  });

  it("deduplicates products by externalProductId", () => {
    const product = parseDanawaProductList(FIXTURE, 1, 30).products[0];
    expect(deduplicateDiscoveredProducts([product, product])).toEqual([
      product,
    ]);
  });
});
