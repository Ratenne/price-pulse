import { describe, it, expect, vi, afterEach } from "vitest";
import { parseProductNews, readProductNews } from "./productNews";

const item = (
  url: string,
  title = "제품 소식 - 매체",
  date = "Wed, 21 Oct 2026 01:00:00 GMT"
) =>
  `<item><title>${title}</title><link>${url}</link><source>매체</source><pubDate>${date}</pubDate></item>`;
const feed = (items: string) => `<rss><channel>${items}</channel></rss>`;
afterEach(() => vi.unstubAllGlobals());
describe("product news", () => {
  it("parses metadata and removes duplicate and unsafe links and invalid dates", () => {
    const url = "https://news.google.com/rss/articles/example";
    const result = parseProductNews(
      feed(
        item(url) +
          item(url) +
          item("javascript:alert(1)") +
          item("https://evil.example") +
          item(`${url}2`, "bad date", "unknown")
      )
    );
    expect(result).toEqual([
      {
        title: "제품 소식",
        url,
        publisher: "매체",
        publishedAt: "2026-10-21T01:00:00.000Z",
      },
    ]);
  });
  it("distinguishes an empty feed from an upstream HTML error", () => {
    expect(parseProductNews(feed(""))).toEqual([]);
    expect(() => parseProductNews("<html>Service error</html>")).toThrow();
  });
  it("requests only the fixed RSS endpoint with encoded query terms", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => feed("") });
    vi.stubGlobal("fetch", fetcher);
    await readProductNews('"RTX 5070" after:2026-09-01');
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.origin).toBe("https://news.google.com");
    expect(url.searchParams.get("q")).toBe('"RTX 5070" after:2026-09-01');
    expect(url.searchParams.get("ceid")).toBe("KR:ko");
  });
});
