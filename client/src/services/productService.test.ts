import { describe, expect, it } from "vitest";
import {
  getCategorySummary,
  getNearLowestPriceProducts,
  getProductById,
  getProducts,
  getProductsByCategory,
  getRelatedProducts,
  getTopPriceRangeProducts,
  sortProducts,
} from "./productService";

describe("productService", () => {
  it("exposes the complete demo catalog by category", () => {
    expect(getProducts()).toHaveLength(28);
    expect(getProductsByCategory("GPU")).toHaveLength(10);
    expect(getProductsByCategory("CPU")).toHaveLength(9);
    expect(getProductsByCategory("LAPTOP")).toHaveLength(9);
  });

  it("sorts products without mutating the source array", () => {
    const products = getProducts();
    const originalIds = products.map(product => product.id);
    const sorted = sortProducts(products, "price-asc");

    expect(products.map(product => product.id)).toEqual(originalIds);
    expect(sorted[0].currentPrice).toBeLessThanOrEqual(sorted[1].currentPrice);
  });

  it("returns the highest price-range products in descending order", () => {
    const top = getTopPriceRangeProducts(10);
    expect(top).toHaveLength(10);
    expect(top.every((product, index) => index === 0 || top[index - 1].priceRangeRate >= product.priceRangeRate)).toBe(true);
  });

  it("returns only products within ten percent of their six-month low", () => {
    const products = getNearLowestPriceProducts();
    expect(products.length).toBeGreaterThan(0);
    expect(products.every(product => product.currentPrice <= product.sixMonthLowPrice * 1.1)).toBe(true);
  });

  it("builds summaries and related products from the same category", () => {
    const product = getProductById("gpu-rtx-5080");
    expect(product).toBeDefined();

    const summary = getCategorySummary("GPU");
    expect(summary.productCount).toBe(10);
    expect(summary.averageRangeRate).toBeGreaterThan(0);

    const related = getRelatedProducts(product!);
    expect(related).toHaveLength(3);
    expect(related.every(candidate => candidate.category === "GPU" && candidate.id !== product!.id)).toBe(true);
  });
});
