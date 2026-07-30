import type { ProductCategory } from "./category";

export type PriceTrend = "RISING" | "FALLING" | "STABLE";

export type PriceStatus = "VERY_LOW" | "LOW" | "FAIR" | "HIGH" | "VERY_HIGH";

export interface PriceHistoryPoint {
  date: string;
  price: number;
}

export interface PriceSummary {
  sixMonthLowPrice: number;
  sixMonthHighPrice: number;
  sixMonthAveragePrice: number;
  priceRangeAmount: number;
  priceRangeRate: number;
  currentPositionRate: number;
  lowestPriceDifferenceRate: number;
}

export interface FairPriceRange {
  fairPriceMin: number;
  fairPriceMax: number;
}

export interface Product extends PriceSummary, FairPriceRange {
  id: string;
  category: ProductCategory;
  manufacturer: string;
  modelName: string;
  displayName: string;
  imageUrl: string;
  tags: string[];
  currentPrice: number;
  previousPrice: number;
  changeAmount: number;
  changeRate: number;
  recentTrend: PriceTrend;
  priceStatus: PriceStatus;
  priceHistory: PriceHistoryPoint[];
  updatedAt: string;
}

export interface ProductSeed {
  id: string;
  category: ProductCategory;
  manufacturer: string;
  modelName: string;
  displayName: string;
  tags?: string[];
  currentPrice: number;
  previousPrice: number;
  lowPrice: number;
  highPrice: number;
  historyPattern: number;
}
