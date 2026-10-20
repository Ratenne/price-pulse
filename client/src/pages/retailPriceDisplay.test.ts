import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import mockProducts from "../data/mockProducts";
import { ProductCard } from "../components/ProductCard";
import { ProductList } from "../components/ProductList";
import ProductDetailPage from "./ProductDetailPage";
import type { Product } from "../domain/product";
const state = vi.hoisted(() => ({ products: [] as Product[] }));
vi.mock("wouter", () => ({
  Link: ({ children, ...props }: any) => createElement("a", props, children),
}));
vi.mock("../hooks/useProductPage", () => ({
  useProductPage: () => ({
    data: { products: state.products },
    loading: false,
    error: null,
    retry() {},
  }),
}));
vi.mock("../components/Header", () => ({ Header: () => null }));
vi.mock("../components/SiteFooter", () => ({ SiteFooter: () => null }));
vi.mock("../components/PriceHistoryChart", () => ({
  PriceHistoryChart: () => null,
}));
describe("retail comparison basis display", () => {
  it.each([null, 0, 3000])(
    "keeps shipping %s distinct across card, list and detail",
    shippingFee => {
      const known = shippingFee !== null;
      const price = known ? 100000 + shippingFee : 99000;
      const product: Product = {
        ...mockProducts[0],
        id: "retail-unit",
        currentPrice: price,
        currentPriceSource: "NAVER",
        currentPriceUrl: "https://smartstore.naver.com/unit/products/123",
        currentPriceShippingFeeKnown: known,
        currentPriceComparisonBasis: known
          ? "SHIPPING_INCLUDED"
          : "DISPLAYED_PRICE",
        offers: [
          {
            source: "NAVER",
            url: "https://smartstore.naver.com/unit/products/123",
            price,
            shippingFee,
            shippingFeeKnown: known,
            comparisonBasis: known ? "SHIPPING_INCLUDED" : "DISPLAYED_PRICE",
            checkedAt: "2026-10-21T00:00:00Z",
          },
        ],
      };
      state.products = [product];
      const label = known
        ? "배송비 포함 확정 비교가격"
        : "표시가격 기준 비교가격 · 배송비 미확인";
      for (const element of [
        createElement(ProductCard, { product }),
        createElement(ProductList, { products: [product] }),
        createElement(ProductDetailPage, { id: product.id }),
      ])
        expect(renderToStaticMarkup(element)).toContain(label);
      const detail = renderToStaticMarkup(
        createElement(ProductDetailPage, { id: product.id })
      );
      expect(detail).toContain("비교가격");
      if (!known) {
        expect(detail).toContain("미확인 · 표시가격 기준");
        expect(detail).not.toContain(">무료<");
      } else if (shippingFee === 0) expect(detail).toContain(">무료<");
      else expect(detail).toContain("3,000원 포함");
    }
  );
});
