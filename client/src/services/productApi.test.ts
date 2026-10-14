import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchProducts } from "./productService";

afterEach(() => vi.unstubAllGlobals());
describe("product catalog API client", () => {
  it("loads products from the server rather than a local seed", async () => {
    const products = [{ id: "danawa-123" }];
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ products }))
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchProducts()).toEqual(products);
    expect(fetchMock).toHaveBeenCalledWith("/api/products", {
      signal: undefined,
    });
  });
  it("reports a database failure without falling back to invented prices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 }))
    );
    await expect(fetchProducts()).rejects.toThrow("불러오지 못했습니다");
  });
  it("rejects a non-catalog response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ products: null })))
    );
    await expect(fetchProducts()).rejects.toThrow("응답 형식");
  });
});
