import { DANAWA_GPU_CATEGORY } from "./danawaCategory.js";
import { DanawaProductListClient } from "./danawaProductListClient.js";
import { DanawaRequestPolicy } from "./danawaRequestPolicy.js";

export interface LivePrices {
  prices: Map<string, number>;
  checkedAt: string;
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
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const result = await list.fetchPage(DANAWA_GPU_CATEGORY, page);
    totalPages = result.totalPages;
    if (totalPages > 40)
      throw new Error("Danawa live list exceeded page limit");
    for (const product of result.products) {
      if (product.currentMinPrice !== undefined) {
        prices.set(product.externalProductId, product.currentMinPrice);
      }
    }
  }
  return { prices, checkedAt: new Date().toISOString() };
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
  for (const product of products) {
    signal?.throwIfAborted();
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
      if (match?.currentMinPrice !== undefined)
        prices.set(product.external_product_id, match.currentMinPrice);
    } catch {
      signal?.throwIfAborted();
      // A removed listing must not be substituted with a different search result.
    }
  }
  return { prices, checkedAt: new Date().toISOString() };
}
