import { describe, it, expect, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createProductsHandler } from "./productsHandler";

function response() {
  const res = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
  res.writeHead.mockReturnValue(res);
  return res;
}

describe("products API", () => {
  it("returns the database catalog as JSON", async () => {
    const res = response();
    await createProductsHandler(async () => ({
      products: [],
      total: 0,
      page: 1,
      pageSize: 10,
      summaries: [],
    }))({ method: "GET" } as IncomingMessage, res as unknown as ServerResponse);
    expect(res.writeHead).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      expect.stringContaining("s-maxage=300")
    );
    expect(res.setHeader).not.toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(JSON.parse(res.end.mock.calls[0][0])).toMatchObject({
      products: [],
      source: "DANAWA",
    });
  });
  it("rejects an invalid page before reading the database", async () => {
    const read = vi.fn();
    const res = response();
    await createProductsHandler(read)(
      {
        method: "GET",
        url: "/api/products?view=rankings&page=-1",
      } as IncomingMessage,
      res as unknown as ServerResponse
    );
    expect(res.writeHead).toHaveBeenCalledWith(400);
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects writes before accessing the database", async () => {
    const read = vi.fn();
    const res = response();
    await createProductsHandler(read)(
      { method: "POST" } as IncomingMessage,
      res as unknown as ServerResponse
    );
    expect(res.writeHead).toHaveBeenCalledWith(405);
    expect(read).not.toHaveBeenCalled();
  });
  it("returns 503 without leaking database credentials or raw errors", async () => {
    const res = response();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await createProductsHandler(async () => {
        throw new Error("secret connection string");
      })(
        { method: "GET" } as IncomingMessage,
        res as unknown as ServerResponse
      );
      expect(res.writeHead).toHaveBeenCalledWith(503);
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
      expect(res.end).toHaveBeenCalledWith(
        JSON.stringify({ error: "CATALOG_UNAVAILABLE" })
      );
      expect(JSON.stringify(spy.mock.calls)).not.toContain(
        "secret connection string"
      );
    } finally {
      spy.mockRestore();
    }
  });
});
