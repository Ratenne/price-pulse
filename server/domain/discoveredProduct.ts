export interface DiscoveredProduct {
  externalProductId: string;
  name: string;
  category: string;
  sourceUrl: string;
  currentMinPrice?: number;
  currentPriceFailureReason?:
    | "CURRENT_PRICE_NOT_PROVIDED"
    | "INVALID_CURRENT_PRICE";
  observedAt?: string;
  registeredYearMonth?: string;
}

export interface DiscoveredProductPage {
  page: number;
  totalProductCount: number;
  totalPages: number;
  products: DiscoveredProduct[];
  rejectedItems?: number;
  rejectedExternalIds?: string[];
}
