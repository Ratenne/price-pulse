export interface DiscoveredProduct {
  externalProductId: string;
  name: string;
  category: string;
  sourceUrl: string;
  currentMinPrice?: number;
  observedAt?: string;
  registeredYearMonth?: string;
}

export interface DiscoveredProductPage {
  page: number;
  totalProductCount: number;
  totalPages: number;
  products: DiscoveredProduct[];
}
