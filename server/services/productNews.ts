import { load } from "cheerio";
import type { ProductNewsItem } from "../../shared/priceInsights";

export function parseProductNews(xml: string): ProductNewsItem[] {
  const $ = load(xml, { xml: true });
  if (!$("rss channel").length) throw new Error("INVALID_NEWS_FEED");
  const seen = new Set<string>();
  return $("item")
    .toArray()
    .flatMap(element => {
      const item = $(element);
      const title = item.find("title").text().trim();
      const url = item.find("link").text().trim();
      const publisher = item.find("source").text().trim();
      const time = Date.parse(item.find("pubDate").text());
      // RSS comes from one fixed upstream. Never expose arbitrary schemes/hosts.
      try {
        const link = new URL(url);
        if (
          link.protocol !== "https:" ||
          link.hostname !== "news.google.com" ||
          link.username ||
          link.password
        )
          return [];
      } catch {
        return [];
      }
      if (!title || !Number.isFinite(time) || seen.has(url)) return [];
      seen.add(url);
      return [
        {
          title:
            publisher && title.endsWith(` - ${publisher}`)
              ? title.slice(0, -publisher.length - 3)
              : title,
          url,
          publisher: publisher || "언론사 미표시",
          publishedAt: new Date(time).toISOString(),
        },
      ];
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 5);
}

export async function readProductNews(query: string) {
  const url = new URL("https://news.google.com/rss/search");
  url.search = new URLSearchParams({
    q: query,
    hl: "ko",
    gl: "KR",
    ceid: "KR:ko",
  }).toString();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/rss+xml, application/xml" },
  });
  if (!response.ok) throw new Error("NEWS_UPSTREAM_FAILED");
  return parseProductNews(await response.text());
}
