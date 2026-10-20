import type { ProductCategory } from "./category";
import type { RetailOffer } from "../../../shared/retailPrices";

export type PriceTrend = "RISING" | "FALLING" | "STABLE";

export type PriceStatus =
  | "VERY_LOW"
  | "LOW"
  | "FAIR"
  | "HIGH"
  | "VERY_HIGH"
  | "UNKNOWN"
  | "INSUFFICIENT_DATA"
  | "LOADING";

export interface PriceHistoryPoint {
  date: string;
  price: number;
}

export interface PriceSummary {
  sixMonthLowPrice: number | null;
  sixMonthHighPrice: number | null;
  sixMonthAveragePrice: number | null;
  priceRangeAmount: number | null;
  priceRangeRate: number | null;
  currentPositionRate: number | null;
  lowestPriceDifferenceRate: number | null;
}

export interface FairPriceRange {
  fairPriceMin: number | null;
  fairPriceMax: number | null;
}

export interface PriceAnalysis {
  comparable: boolean;
  observationCount: number;
  rankingPeriod: "SIX_MONTHS" | "UNDER_SIX_MONTHS" | "INSUFFICIENT";
  dataStatus:
    | "NORMAL"
    | "INSUFFICIENT_HISTORY"
    | "NO_SOURCE_DATA"
    | "COLLECTION_FAILED";
  monthlyCount: number;
  firstHistoryMonth: string | null;
  lastHistoryMonth: string | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  coverageFirstObservedAt: string | null;
  coverageLastObservedAt: string | null;
}

export interface Product extends PriceSummary, FairPriceRange {
  id: string;
  category: ProductCategory;
  manufacturer: string;
  modelName: string;
  displayName: string;
  imageUrl: string;
  tags: string[];
  currentPrice: number | null;
  previousPrice: number | null;
  changeAmount: number | null;
  changeRate: number | null;
  recentTrend: PriceTrend;
  priceStatus: PriceStatus;
  priceHistory: PriceHistoryPoint[];
  excludedHistoryMonths?: string[];
  updatedAt: string;
  sourceUrl?: string;
  latestHistoryMonth?: string;
  currentPriceCheckedAt?: string;
  currentPriceMonth?: string;
  currentPriceSource?: RetailOffer["source"];
  currentPriceUrl?: string;
  currentPriceShippingFeeKnown?: boolean;
  currentPriceComparisonBasis?: RetailOffer["comparisonBasis"];
  currentPriceShippingFee?: number | null;
  currentPriceDisplayedPrice?: number | null;
  currentPriceItemPrice?: number | null;
  offers?: RetailOffer[];
  analysis?: PriceAnalysis;
  observedPriceHistory?: PriceHistoryPoint[];
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
