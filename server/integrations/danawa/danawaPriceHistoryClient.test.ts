import { describe, expect, it, vi } from "vitest";
import { DanawaIntegrationError } from "./danawaErrors";
import { DanawaPriceHistoryClient } from "./danawaPriceHistoryClient";

describe("DanawaPriceHistoryClient", () => {
  it("calls the configured endpoint with productCode and cache-busting timestamp", async () => {
    const fetchFunction = vi.fn(
      async () =>
        new Response(JSON.stringify({ "6": { result: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
    const client = new DanawaPriceHistoryClient({
      endpoint: "https://example.test/history",
      now: () => 1_234_567,
      fetchFunction,
    });

    await client.fetchPriceHistory("9503733");

    const requestedUrl = fetchFunction.mock.calls[0][0] as URL;
    const requestInit = fetchFunction.mock.calls[0][1];
    expect(requestedUrl.searchParams.get("productCode")).toBe("9503733");
    expect(requestedUrl.searchParams.get("_")).toBe("1234567");
    expect(requestInit?.headers).toMatchObject({
      Referer: "https://prod.danawa.com/info/?pcode=9503733",
      "X-Requested-With": "XMLHttpRequest",
    });
  });

  it("rejects an invalid productCode before making a request", async () => {
    const fetchFunction = vi.fn();
    const client = new DanawaPriceHistoryClient({ fetchFunction });

    await expect(client.fetchPriceHistory("not-a-code")).rejects.toMatchObject({
      stage: "VALIDATION",
    });
    expect(fetchFunction).not.toHaveBeenCalled();
  });

  it("exposes HTTP status without reading or logging the response body", async () => {
    const client = new DanawaPriceHistoryClient({
      fetchFunction: vi.fn(
        async () => new Response("failure", { status: 503 })
      ),
    });

    await expect(client.fetchPriceHistory("9503733")).rejects.toEqual(
      expect.objectContaining<Partial<DanawaIntegrationError>>({
        stage: "HTTP",
        status: 503,
      })
    );
  });
});
