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
  return sortProducts(products, "range").slice(0, limit);
}

export function getNearLowestPriceProducts(
  limit: number | undefined,
  catalog: Product[]
): Product[] {
  const products = sortProducts(
    catalog.filter(
      product => product.currentPrice <= product.sixMonthLowPrice * 1.1
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
    .sort(
      (a, b) =>
        Math.abs(a.currentPrice - product.currentPrice) -
        Math.abs(b.currentPrice - product.currentPrice)
    )
    .slice(0, limit);
}

export function getCategorySummary(
  category: ProductCategory,
  catalog: Product[]
): CategorySummary {
  const products = getProductsByCategory(category, catalog);
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
