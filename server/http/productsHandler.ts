import type { IncomingMessage, ServerResponse } from "node:http";
import { getDatabasePool } from "../config/database";
import { readProductCatalog } from "../services/productCatalog";

export function createProductsHandler(
  read = () => readProductCatalog(getDatabasePool())
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
      const products = await read();
      res.setHeader(
        "Cache-Control",
        "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
      );
      res
        .writeHead(200)
        .end(
          JSON.stringify({ products, source: "DANAWA", granularity: "MONTH" })
        );
    } catch (error) {
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
