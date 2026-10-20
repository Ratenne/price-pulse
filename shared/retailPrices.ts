export const RETAILERS = {
  COUPANG: "쿠팡",
  "11ST": "11번가",
  GMARKET: "G마켓",
  AUCTION: "옥션",
  NAVER: "네이버쇼핑",
} as const;
export type Retailer = keyof typeof RETAILERS;
export interface RetailOffer {
  source: Retailer | "DANAWA";
  price: number;
  shippingFee: number | null;
  checkedAt: string;
  url: string;
}
