import { DANAWA_GPU_CATEGORY } from "./danawaCategory.js";
import { DanawaProductListClient } from "./danawaProductListClient.js";
import { DanawaRequestPolicy } from "./danawaRequestPolicy.js";
import { DanawaIntegrationError } from "./danawaErrors.js";
import { performance } from "node:perf_hooks";
import {
  collectionFailure,
  type ObservedPriceDetails,
} from "../../domain/priceCollection.js";

export interface LivePrices {
  prices: Map<string, number>;
  checkedAt: string;
  details?: Map<string, ObservedPriceDetails>;
  failures?: Map<string, string>;
  selectedDurationsMs?: Map<string, number>;
  failureDetails?: Map<
    string,
    { reason: string; status?: number; exceptionType?: string }
  >;
  listDiagnostics?: {
    listedIds: Set<string>;
    priceFailures: Map<string, string>;
    rejectedItems: number;
    rejectedExternalIds: Set<string>;
  };
}

// Coalesce only overlapping requests, never reuse completed price results.
let inFlight: Promise<LivePrices> | undefined;
const policy = new DanawaRequestPolicy({
  requestDelayMs: 1000,
  retryCount: 1,
  retryBackoffMs: 2000,
  timeoutMs: 8000,
});
const client = new DanawaProductListClient(policy, 100);

export async function fetchLivePrices(
  list: Pick<DanawaProductListClient, "fetchPage"> = client
): Promise<LivePrices> {
  const prices = new Map<string, number>();
  const details = new Map<string, ObservedPriceDetails>();
  const listedIds = new Set<string>();
  const priceFailures = new Map<string, string>();
  let rejectedItems = 0;
  const rejectedExternalIds = new Set<string>();
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    let result;
    try {
      result = await list.fetchPage(DANAWA_GPU_CATEGORY, page);
    } catch (error) {
      const wrapped =
        error instanceof DanawaIntegrationError
          ? new DanawaIntegrationError(
              "Danawa list page failed",
              error.stage,
              error.status,
              { cause: error }
            )
          : new Error("Danawa list page failed", { cause: error });
      throw Object.assign(wrapped, { page });
    }
    rejectedItems += result.rejectedItems ?? 0;
    for (const id of result.rejectedExternalIds ?? [])
      rejectedExternalIds.add(id);
    const observedAt = new Date().toISOString();
    totalPages = result.totalPages;
    if (totalPages > 40)
      throw Object.assign(new Error("Danawa live list exceeded page limit"), {
        page,
      });
    for (const product of result.products) {
      listedIds.add(product.externalProductId);
      if (product.currentMinPrice !== undefined) {
        prices.set(product.externalProductId, product.currentMinPrice);
        details.set(product.externalProductId, {
          observedAt: product.observedAt ?? observedAt,
          shippingFee: null,
        });
        priceFailures.delete(product.externalProductId);
      } else if (!prices.has(product.externalProductId)) {
        priceFailures.set(
          product.externalProductId,
          product.currentPriceFailureReason ?? "CURRENT_PRICE_NOT_PROVIDED"
        );
      }
    }
  }
  return {
    prices,
    details,
    checkedAt: new Date().toISOString(),
    listDiagnostics: {
      listedIds,
      priceFailures,
      rejectedItems,
      rejectedExternalIds,
    },
  };
}

export function readLivePrices(): Promise<LivePrices> {
  if (!inFlight) {
    inFlight = fetchLivePrices().finally(() => {
      inFlight = undefined;
    });
  }
  return inFlight;
}

export async function readSelectedLivePrices(
  products: { external_product_id: string; name: string }[],
  list: Pick<DanawaProductListClient, "fetchPage"> = client,
  signal?: AbortSignal
): Promise<LivePrices> {
  const prices = new Map<string, number>();
  const details = new Map<string, ObservedPriceDetails>();
  const seen = new Set<string>();
  const selectedDurationsMs = new Map<string, number>();
  const failures = new Map<string, string>();
  const failureDetails = new Map<
    string,
    { reason: string; status?: number; exceptionType?: string }
  >();
  for (const product of products) {
    if (seen.has(product.external_product_id)) continue;
    seen.add(product.external_product_id);
    signal?.throwIfAborted();
    const startedAt = performance.now();
    try {
      const result = await list.fetchPage(
        DANAWA_GPU_CATEGORY,
        1,
        product.name,
        signal
      );
      const match = result.products.find(
        p => p.externalProductId === product.external_product_id
      );
      if (match?.currentMinPrice !== undefined) {
        prices.set(product.external_product_id, match.currentMinPrice);
        details.set(product.external_product_id, {
          observedAt: match.observedAt ?? new Date().toISOString(),
          shippingFee: null,
        });
      } else {
        const reason = match
          ? (match.currentPriceFailureReason ?? "CURRENT_PRICE_NOT_PROVIDED")
          : "PRODUCT_ID_NOT_FOUND";
        failures.set(product.external_product_id, reason);
        failureDetails.set(product.external_product_id, { reason });
      }
    } catch (error) {
      signal?.throwIfAborted();
      const reason = collectionFailure(error);
      failures.set(product.external_product_id, reason);
      failureDetails.set(product.external_product_id, {
        reason,
        exceptionType: error instanceof Error ? error.name : typeof error,
        ...(error instanceof DanawaIntegrationError &&
        error.status !== undefined
          ? { status: error.status }
          : {}),
      });
      // A removed listing must not be substituted with a different search result.
    } finally {
      selectedDurationsMs.set(
        product.external_product_id,
        Math.round(performance.now() - startedAt)
      );
    }
  }
  return {
    prices,
    details,
    failures,
    failureDetails,
    selectedDurationsMs,
    checkedAt: new Date().toISOString(),
  };
}
