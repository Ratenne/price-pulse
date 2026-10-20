import type { Product } from "../client/src/domain/product";
import type { ProductCategory } from "../client/src/domain/category";
import { hasPriceAnalysis } from "./priceAnalysis";

export interface CatalogSummary {
  category: ProductCategory;
  productCount: number;
  averageRangeRate: number | null;
  nearLowestCount: number | null;
}
export interface ProductPage {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  summaries: CatalogSummary[];
}
export interface LivePricePage {
  prices: { id: string; price: number | null; checkedAt: string }[];
}

export function applyCurrentPrice(
  product: Product,
  price: number | null,
  checkedAt?: string
): Product {
  if (!hasPriceAnalysis(product))
    return {
      ...product,
      currentPrice: price,
      currentPriceCheckedAt: checkedAt,
      priceStatus: "INSUFFICIENT_DATA",
      currentPositionRate: null,
      lowestPriceDifferenceRate: null,
      changeAmount: null,
      changeRate: null,
    };
  const range = product.priceRangeAmount;
  const position =
    price === null
      ? 50
      : range
        ? Math.max(
            0,
            Math.min(100, ((price - product.sixMonthLowPrice) / range) * 100)
          )
        : 50;
  const changeAmount =
    price === null || product.previousPrice === null
      ? null
      : price - product.previousPrice;
  const changeRate =
    changeAmount === null || !product.previousPrice
      ? null
      : (changeAmount / product.previousPrice) * 100;
  return {
    ...product,
    currentPrice: price,
    currentPriceCheckedAt: checkedAt,
    changeAmount,
    changeRate,
    currentPositionRate: position,
    lowestPriceDifferenceRate:
      price === null
        ? 0
        : ((price - product.sixMonthLowPrice) / product.sixMonthLowPrice) * 100,
    recentTrend:
      changeRate !== null && changeRate >= 1
        ? "RISING"
        : changeRate !== null && changeRate <= -1
          ? "FALLING"
          : "STABLE",
    priceStatus:
      price === null
        ? "UNKNOWN"
        : position <= 10
          ? "VERY_LOW"
          : position <= 30
            ? "LOW"
            : position <= 65
              ? "FAIR"
              : position <= 85
                ? "HIGH"
                : "VERY_HIGH",
  };
}
