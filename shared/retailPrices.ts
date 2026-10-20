export const RETAILERS = {
  COUPANG: "쿠팡",
  "11ST": "11번가",
  GMARKET: "G마켓",
  AUCTION: "옥션",
  NAVER: "네이버쇼핑",
} as const;
export type Retailer = keyof typeof RETAILERS;
export type ComparisonBasis = "SHIPPING_INCLUDED" | "DISPLAYED_PRICE";
// A null fee is unknown, never zero. Missing displayed evidence cannot be used
// as an unknown-shipping comparison price.
export function retailComparisonPrice(values: {
  itemPrice: number | null;
  shippingFee: number | null;
  displayedPrice?: number | null;
}): number | null {
  if (
    values.shippingFee !== null &&
    (!Number.isSafeInteger(values.shippingFee) ||
      values.shippingFee < 0 ||
      values.itemPrice === null ||
      !Number.isSafeInteger(values.itemPrice) ||
      values.itemPrice <= 0)
  )
    return null;
  const price =
    values.shippingFee === null
      ? (values.displayedPrice ?? null)
      : values.itemPrice === null
        ? null
        : values.itemPrice + values.shippingFee;
  return price !== null &&
    Number.isSafeInteger(price) &&
    price > 0 &&
    price <= 2_000_000_000
    ? price
    : null;
}
export interface RetailOffer {
  source: Retailer | "DANAWA";
  price: number;
  shippingFee: number | null;
  shippingFeeKnown?: boolean;
  itemPrice?: number | null;
  displayedPrice?: number | null;
  comparisonPrice?: number;
  comparisonBasis?: ComparisonBasis;
  checkedAt: string;
  url: string;
}
