import mockProducts from "@/data/mockProducts";
import type { ProductCategory } from "@/domain/category";
import type { Product } from "@/domain/product";

export type ProductSort = "range" | "price-asc" | "price-desc" | "near-low";

export interface CategorySummary {
  category: ProductCategory;
  productCount: number;
  averageRangeRate: number;
  nearLowestCount: number;
}

export function sortProducts(
  products: Product[],
  sort: ProductSort = "range"
): Product[] {
  return [...products].sort((a, b) => {
    if (sort === "price-asc") return a.currentPrice - b.currentPrice;
    if (sort === "price-desc") return b.currentPrice - a.currentPrice;
    if (sort === "near-low") {
      return a.lowestPriceDifferenceRate - b.lowestPriceDifferenceRate;
    }

    return (
      b.priceRangeRate - a.priceRangeRate ||
      b.priceRangeAmount - a.priceRangeAmount
    );
  });
}

export function getProducts(): Product[] {
  return [...mockProducts];
}

export function getProductsByCategory(category: ProductCategory): Product[] {
  return mockProducts.filter(product => product.category === category);
}

export function getTopPriceRangeProducts(limit = 10): Product[] {
  return sortProducts(mockProducts, "range").slice(0, limit);
}

export function getNearLowestPriceProducts(limit?: number): Product[] {
  const products = sortProducts(
    mockProducts.filter(
      product => product.currentPrice <= product.sixMonthLowPrice * 1.1
    ),
    "near-low"
  );

  return typeof limit === "number" ? products.slice(0, limit) : products;
}

export function getProductById(id: string): Product | undefined {
  return mockProducts.find(product => product.id === id);
}

export function getRelatedProducts(product: Product, limit = 3): Product[] {
  return getProductsByCategory(product.category)
    .filter(candidate => candidate.id !== product.id)
    .sort(
      (a, b) =>
        Math.abs(a.currentPrice - product.currentPrice) -
        Math.abs(b.currentPrice - product.currentPrice)
    )
    .slice(0, limit);
}

export function getCategorySummary(category: ProductCategory): CategorySummary {
  const products = getProductsByCategory(category);
  const averageRangeRate =
    products.reduce((sum, product) => sum + product.priceRangeRate, 0) /
    Math.max(1, products.length);

  return {
    category,
    productCount: products.length,
    averageRangeRate,
    nearLowestCount: products.filter(
      product => product.currentPrice <= product.sixMonthLowPrice * 1.1
    ).length,
  };
}
