import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "../config/database.js";
import {
  readProductPage,
  parseProductQuery,
  type ProductQuery,
} from "../services/productPage.js";

// Prices are a stored snapshot (refreshed every few hours), so the CDN can serve
// repeat views from cache and refresh in the background.
const CACHE_CONTROL =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";

export function createProductsHandler(
  read = (query: ProductQuery, signal?: AbortSignal) =>
    readProductPage(getDatabasePool(), query, new Date(), signal)
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.writeHead(405).end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
      return;
    }
    try {
      let query;
      try {
        query = parseProductQuery(req.url ?? "/api/products");
      } catch {
        res.writeHead(400).end(JSON.stringify({ error: "INVALID_QUERY" }));
        return;
      }
      const controller = new AbortController();
      res.on?.("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      const result = await read(query, controller.signal);
      if (res.destroyed) return;
      res.setHeader("Cache-Control", CACHE_CONTROL);
      res
        .writeHead(200)
        .end(
          JSON.stringify({
            ...result,
            source: "MULTI_SOURCE",
            historySource: "DANAWA",
            granularity: "MONTH",
          })
        );
    } catch (error) {
      if (res.destroyed) return;
      console.error(
        JSON.stringify({
          message: "Product catalog query failed",
          exceptionType: error instanceof Error ? error.name : typeof error,
        })
      );
      res.setHeader("Cache-Control", "no-store");
      res.writeHead(503).end(JSON.stringify({ error: "CATALOG_UNAVAILABLE" }));
    }
  };
}
