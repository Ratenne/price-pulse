import type { RetailLink, RetailObservation } from "./retailPrice.js";

import type { RetailSkipStatus } from "./retailPolicy.js";

export class RetailFetchError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: RetailSkipStatus
  ) {
    super(code);
  }
}

// Kept as a fail-closed compatibility entry point for old manual/probe callers.
// Offline HTML parsers remain available only for fixture verification.
export async function fetchRetailOffer(
  _link: RetailLink,
  _fetchFn?: typeof fetch
): Promise<RetailObservation> {
  throw new RetailFetchError("HTML_COLLECTION_DISABLED", "UNSUPPORTED");
}
