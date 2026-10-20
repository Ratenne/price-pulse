import { describe, it, expect, vi } from "vitest";
import { fetchLivePrices, readSelectedLivePrices } from "./danawaLivePrices";
describe("read-only live prices", () => {
  it("deduplicates selected product codes and exposes HTTP failures for batch reporting", async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error("network"));
    const product = { external_product_id: "123", name: "GPU" };
    const result = await readSelectedLivePrices([product, product], {
      fetchPage,
    });
    expect(fetchPage).toHaveBeenCalledOnce();
    expect(result.prices.size).toBe(0);
    expect(result.failures?.get("123")).toBe("NETWORK_OR_RESPONSE");
  });
  it("searches only selected products and matches productCode rather than taking an unrelated result", async () => {
    const fetchPage = vi.fn(async () => ({
      page: 1,
      totalProductCount: 1,
      totalPages: 1,
      products: [
        {
          externalProductId: "wrong",
          name: "GPU",
          category: "GPU",
          sourceUrl: "https://prod.danawa.com/info/",
          currentMinPrice: 100,
        },
      ],
    }));
    const result = await readSelectedLivePrices(
      [{ external_product_id: "123", name: "Exact GPU name" }],
      { fetchPage }
    );
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage.mock.calls[0][2]).toBe("Exact GPU name");
    expect(result.prices.has("123")).toBe(false);
  });
  it("does not send requests for an already cancelled page", async () => {
    const fetchPage = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(
      readSelectedLivePrices(
        [{ external_product_id: "123", name: "GPU" }],
        { fetchPage },
        controller.signal
      )
    ).rejects.toThrow();
    expect(fetchPage).not.toHaveBeenCalled();
  });
  it("reads fresh list pages on every completed request and does not reuse an earlier result", async () => {
    let price = 100;
    const fetchPage = vi.fn(async (_category: unknown, page: number) => ({
      page,
      totalProductCount: 2,
      totalPages: 2,
      products: [
        {
          externalProductId: String(page),
          name: "GPU",
          category: "GPU",
          sourceUrl: "https://prod.danawa.com/info/",
          currentMinPrice: price,
        },
      ],
    }));
    expect((await fetchLivePrices({ fetchPage })).prices.get("1")).toBe(100);
    price = 200;
    expect((await fetchLivePrices({ fetchPage })).prices.get("1")).toBe(200);
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });
});
