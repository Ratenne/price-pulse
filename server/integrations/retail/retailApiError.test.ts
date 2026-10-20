import { describe, expect, it } from "vitest";
import { retailApiHttpError, retailApiNetworkError } from "./retailApiError";
describe("provider-independent failure classification, no provider request", () => {
  it.each([
    [401, "AUTHENTICATION_FAILED"],
    [403, "PERMISSION_DENIED"],
    [429, "RATE_LIMITED"],
    [500, "UPSTREAM_UNAVAILABLE"],
    [503, "UPSTREAM_UNAVAILABLE"],
    [400, "INVALID_RESPONSE"],
  ])("classifies mock HTTP %s", (status, code) => {
    const response = new Response("credential-bearing provider error body", {
      status: Number(status),
    });
    const error = retailApiHttpError(response.status);
    expect(error.code).toBe(code);
    expect(String(error)).not.toContain("credential-bearing");
    expect(error.code).not.toBe("UNAVAILABLE_OFFER");
  });
  it("keeps timeout and transient network failures separate from stock-out", () => {
    const timeout = new Error("token value must not leak");
    timeout.name = "TimeoutError";
    expect(retailApiNetworkError(timeout).code).toBe("TIMEOUT");
    expect(
      retailApiNetworkError(new Error("upstream URL and secret")).code
    ).toBe("UPSTREAM_UNAVAILABLE");
    expect(String(retailApiNetworkError(timeout))).not.toContain("token value");
  });
});
