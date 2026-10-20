import type { ProductCategory } from "@/domain/category";
import type { Product } from "@/domain/product";
import { hasPriceAnalysis } from "@shared/priceAnalysis";

export type ProductSort = "range" | "price-asc" | "price-desc" | "near-low";

export interface CategorySummary {
  category: ProductCategory;
  productCount: number;
  averageRangeRate: number | null;
  nearLowestCount: number;
}

export function sortProducts(
  products: Product[],
  sort: ProductSort = "range"
): Product[] {
  return [...products].sort((a, b) => {
    if (sort !== "range") {
      if (a.currentPrice === null && b.currentPrice === null) return 0;
      if (a.currentPrice === null) return 1;
      if (b.currentPrice === null) return -1;
    }
    if (sort === "price-asc") return a.currentPrice! - b.currentPrice!;
    if (sort === "price-desc") return b.currentPrice! - a.currentPrice!;
    if (sort === "near-low") {
      if (a.lowestPriceDifferenceRate === null)
        return b.lowestPriceDifferenceRate === null ? 0 : 1;
      if (b.lowestPriceDifferenceRate === null) return -1;
      return a.lowestPriceDifferenceRate - b.lowestPriceDifferenceRate;
    }

    if (!hasPriceAnalysis(a)) return hasPriceAnalysis(b) ? 1 : 0;
    if (!hasPriceAnalysis(b)) return -1;

    return (
      b.priceRangeRate - a.priceRangeRate ||
      b.priceRangeAmount - a.priceRangeAmount
    );
  });
}

export async function fetchProducts(signal?: AbortSignal): Promise<Product[]> {
  const response = await fetch("/api/products", { signal });
  if (!response.ok) throw new Error("상품 데이터를 불러오지 못했습니다.");
  const body = await response.json();
  if (!Array.isArray(body.products))
    throw new Error("상품 응답 형식이 올바르지 않습니다.");
  return body.products;
}

export function getProductsByCategory(
  category: ProductCategory,
  products: Product[]
): Product[] {
  return products.filter(product => product.category === category);
}

export function getTopPriceRangeProducts(
  limit = 10,
  products: Product[]
): Product[] {
  return sortProducts(
    products.filter(
      product =>
        hasPriceAnalysis(product) &&
        (!product.analysis || product.analysis.rankingPeriod === "SIX_MONTHS")
    ),
    "range"
  ).slice(0, limit);
}

export function getNearLowestPriceProducts(
  limit: number | undefined,
  catalog: Product[]
): Product[] {
  const products = sortProducts(
    catalog.filter(
      product =>
        hasPriceAnalysis(product) &&
        product.currentPrice !== null &&
        product.currentPrice <= product.sixMonthLowPrice * 1.1
    ),
    "near-low"
  );

  return typeof limit === "number" ? products.slice(0, limit) : products;
}

export function getProductById(
  id: string,
  products: Product[]
): Product | undefined {
  return products.find(product => product.id === id);
}

export function getRelatedProducts(
  product: Product,
  limit = 3,
  products: Product[]
): Product[] {
  return getProductsByCategory(product.category, products)
    .filter(candidate => candidate.id !== product.id)
    .sort((a, b) => distance(a, product) - distance(b, product))
    .slice(0, limit);
}

export function getCategorySummary(
  category: ProductCategory,
  catalog: Product[]
): CategorySummary {
  const products = getProductsByCategory(category, catalog);
  const analyzed = products.filter(hasPriceAnalysis);
  const averageRangeRate = analyzed.length
    ? analyzed.reduce((sum, product) => sum + product.priceRangeRate, 0) /
      analyzed.length
    : null;

  return {
    category,
    productCount: products.length,
    averageRangeRate,
    nearLowestCount: products.filter(
      product =>
        hasPriceAnalysis(product) &&
        product.currentPrice !== null &&
        product.currentPrice <= product.sixMonthLowPrice * 1.1
    ).length,
  };
}

function distance(a: Product, b: Product) {
  const left = a.currentPrice ?? a.sixMonthAveragePrice;
  const right = b.currentPrice ?? b.sixMonthAveragePrice;
  return left === null || right === null ? Infinity : Math.abs(left - right);
}
