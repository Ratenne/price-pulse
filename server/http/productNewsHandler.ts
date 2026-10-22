import type { IncomingMessage, ServerResponse } from "node:http";
import { readProductNews } from "../services/productNews.js";

export function createProductNewsHandler(read = readProductNews) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.writeHead(405).end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
      return;
    }
    const params = new URL(req.url ?? "/", "http://localhost").searchParams;
    const model = (params.get("q") ?? "").trim();
    const month = params.get("month");
    if (
      model.length < 2 ||
      model.length > 160 ||
      (month !== null && !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month))
    ) {
      res.writeHead(400).end(JSON.stringify({ error: "INVALID_QUERY" }));
      return;
    }
    // Treat model as literal search terms; callers cannot inject search operators.
    const terms = model
      .replace(new RegExp("[^\\p{L}\\p{N}\\s.+-]", "gu"), " ")
      .replace(/\s+/g, " ")
      .trim();
    if (terms.length < 2) {
      res.writeHead(400).end(JSON.stringify({ error: "INVALID_QUERY" }));
      return;
    }
    let period = "when:90d";
    if (month) {
      const end = new Date(`${month}-01T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + 1);
      period = `after:${month}-01 before:${end.toISOString().slice(0, 10)}`;
    }
    try {
      const articles = await read(`"${terms}" ${period}`);
      res.setHeader(
        "Cache-Control",
        "public, max-age=0, s-maxage=900, stale-while-revalidate=1800"
      );
      res
        .writeHead(200)
        .end(JSON.stringify({ articles, checkedAt: new Date().toISOString() }));
    } catch {
      res.writeHead(503).end(JSON.stringify({ error: "NEWS_UNAVAILABLE" }));
    }
  };
}
