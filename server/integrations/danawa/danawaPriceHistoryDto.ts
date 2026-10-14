export interface DanawaPricePointResponse {
  Fulldate?: string;
  date?: string;
  minPrice?: number | null;
}

export interface DanawaPeriodPriceResponse {
  count?: number;
  result?: DanawaPricePointResponse[];
  maxPrice?: number;
  minPrice?: number;
}

export interface DanawaPriceHistoryResponse {
  "1"?: DanawaPeriodPriceResponse;
  "3"?: DanawaPeriodPriceResponse;
  "6"?: DanawaPeriodPriceResponse;
  "12"?: DanawaPeriodPriceResponse;
  "24"?: DanawaPeriodPriceResponse;
}
