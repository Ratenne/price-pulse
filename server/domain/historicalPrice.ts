export const PRICE_SOURCE = {
  DANAWA: "DANAWA",
} as const;

export type PriceSource = (typeof PRICE_SOURCE)[keyof typeof PRICE_SOURCE];

export interface HistoricalPrice {
  price: number;
  priceYearMonth: string;
  granularity: "MONTH";
  sourceType: "HISTORICAL_IMPORT";
}

export interface HistoricalPriceCollection {
  prices: HistoricalPrice[];
  receivedCount: number;
  invalidCount: number;
  selectedPeriod: 24 | 12 | 6;
}

export interface HistoricalPriceCollector {
  collect(externalProductId: string): Promise<HistoricalPriceCollection>;
}
