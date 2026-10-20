import { RetailFetchError } from "./retailClient.js";

export type RetailApiErrorCode =
  | "MISSING_CREDENTIALS"
  | "INVALID_AUTH_CONFIGURATION"
  | "AUTHENTICATION_FAILED"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "MISSING_PRODUCT_INFORMATION"
  | "SHIPPING_UNVERIFIED"
  | "PRODUCT_VALIDATION_FAILED";

// Codes are fixed; never copy provider bodies, request URLs or auth headers.
export class RetailApiError extends RetailFetchError {
  constructor(public readonly code: RetailApiErrorCode) {
    super(code);
  }
}
export function retailApiHttpError(status: number): RetailApiError {
  return new RetailApiError(
    status === 401
      ? "AUTHENTICATION_FAILED"
      : status === 403
        ? "PERMISSION_DENIED"
        : status === 429
          ? "RATE_LIMITED"
          : status >= 500
            ? "UPSTREAM_UNAVAILABLE"
            : "INVALID_RESPONSE"
  );
}
export function retailApiNetworkError(error: unknown): RetailApiError {
  const timedOut =
    error instanceof Error &&
    ["TimeoutError", "AbortError"].includes(error.name);
  return new RetailApiError(timedOut ? "TIMEOUT" : "UPSTREAM_UNAVAILABLE");
}
