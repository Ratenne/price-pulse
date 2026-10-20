import type { HistoricalPriceCollection } from "./historicalPrice";
import { koreaYearMonth } from "./priceCalendar";
import { DanawaIntegrationError } from "../integrations/danawa/danawaErrors";

export type PriceDataStatus =
  | "NORMAL"
  | "INSUFFICIENT_HISTORY"
  | "NO_SOURCE_DATA"
  | "COLLECTION_FAILED";
export interface CollectionStatus {
  status: PriceDataStatus;
  reason: string;
  checkedAt: string;
}
export interface ObservedPriceDetails {
  observedAt: string;
  shippingFee: number | null;
}

export function collectionFailure(error: unknown): string {
  return error instanceof DanawaIntegrationError
    ? error.stage
    : "NETWORK_OR_RESPONSE";
}

export function completedHistoricalCollection(
  collection: HistoricalPriceCollection,
  now = new Date()
) {
  const month = koreaYearMonth(now);
  const prices = collection.prices.filter(p => p.priceYearMonth < month);
  let status: PriceDataStatus = "NORMAL";
  let reason = "COMPLETED_MONTHS_PROVIDED";
  if (collection.invalidCount > 0) {
    status = "COLLECTION_FAILED";
    reason = "PARTIAL_INVALID_RESPONSE";
  } else if (collection.availability === "NO_SOURCE_DATA") {
    status = "NO_SOURCE_DATA";
    reason = "EXPLICIT_EMPTY_MONTHLY_PERIODS";
  } else if (!prices.length) {
    const currentOnly =
      collection.prices.length > 0 &&
      collection.prices.every(p => p.priceYearMonth === month);
    status = currentOnly ? "INSUFFICIENT_HISTORY" : "COLLECTION_FAILED";
    reason = currentOnly ? "CURRENT_MONTH_ONLY" : "UNEXPECTED_MONTHLY_RESPONSE";
  }
  return { prices, status, reason, checkedAt: now.toISOString() };
}
