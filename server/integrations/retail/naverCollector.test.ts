import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createNaverHtmlCollector } from "./naverCollector";
import {
  naverTestOptions,
  naverTestPolicy,
  naverTestUrl,
  naverOtherTestUrl,
  naverTestNow,
} from "./__fixtures__/naverTestSupport";
const robots = (text = "User-agent: *\nAllow: /") =>
  new Response(text, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
const html = (
  body = "<html><body>synthetic transport payload, NOT Naver product HTML</body></html>"
) =>
  new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
function setup() {
  const fetchFn = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(robots())
    .mockResolvedValue(html());
  const sleep = vi.fn(async (_ms: number) => {});
  const collector = createNaverHtmlCollector({
    ...naverTestOptions,
    fetchFn,
    sleep,
  });
  return { fetchFn, sleep, collector };
}
describe("Naver approved transport with mock HTTP only", () => {
  it("returns bounded HTML and actual completion time after robots, without impersonation", async () => {
    const { collector, fetchFn, sleep } = setup();
    const page = await collector.collect(naverTestUrl);
    expect(page).toMatchObject({
      url: naverTestUrl,
      observedAt: naverTestNow.toISOString(),
    });
    expect(page.html).toContain("synthetic transport payload");
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      "https://smartstore.naver.com/robots.txt",
      naverTestUrl,
    ]);
    expect(sleep).toHaveBeenCalledWith(1500);
    for (const [, request] of fetchFn.mock.calls) {
      expect(request).toMatchObject({
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        headers: { "User-Agent": "PricePulse/0.1" },
      });
      expect(request?.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.stringify(request?.headers)).not.toMatch(
        /Authorization|Cookie|Mozilla/i
      );
    }
  });
  it("blocks disabled, pending and missing path approval before even robots HTTP", async () => {
    for (const options of [
      { env: {} },
      { env: naverTestOptions.env },
      {
        ...naverTestOptions,
        policies: { NAVER: { ...naverTestPolicy, crawl: undefined } },
      },
      {
        ...naverTestOptions,
        policies: {
          NAVER: {
            ...naverTestPolicy,
            crawl: {
              ...naverTestPolicy.crawl,
              allowedUrls: [naverOtherTestUrl],
            },
          },
        },
      },
    ]) {
      const fetchFn = vi.fn<typeof fetch>();
      await expect(
        createNaverHtmlCollector({ ...options, fetchFn }).collect(naverTestUrl)
      ).rejects.toThrow();
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it.each([
    "http://smartstore.naver.com/unit-shop/products/123",
    "https://smartstore.naver.com.evil.example/unit-shop/products/123",
    "https://evil.example/unit-shop/products/123",
    "https://shopping.naver.com/catalog/123",
    "https://search.shopping.naver.com/search/all?query=GPU",
    "https://smartstore.naver.com/unit-shop/products/123?coupon=1",
    "https://smartstore.naver.com/unit-shop/products/123#price",
    "https://user:pass@smartstore.naver.com/unit-shop/products/123",
    "https://smartstore.naver.com:8443/unit-shop/products/123",
    "https://smartstore.naver.com/unit%2fshop/products/123",
  ])("rejects unsupported target %s without HTTP", async url => {
    const { fetchFn, collector } = setup();
    await expect(collector.collect(url)).rejects.toThrow(
      "NAVER_TARGET_NOT_SUPPORTED"
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("honors the actual robots denial fixture and never reads a product", async () => {
    const { collector, fetchFn } = setup();
    fetchFn
      .mockReset()
      .mockResolvedValue(
        robots(
          readFileSync(
            new URL("./__fixtures__/naver-stores.robots.txt", import.meta.url),
            "utf8"
          )
        )
      );
    await expect(collector.collect(naverTestUrl)).rejects.toThrow(
      "ROBOTS_NOT_ALLOWED"
    );
    await expect(collector.collect(naverOtherTestUrl)).rejects.toThrow(
      "ROBOTS_NOT_ALLOWED"
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it("re-evaluates path rules for each URL even with cached robots", async () => {
    const { collector, fetchFn } = setup();
    fetchFn
      .mockReset()
      .mockResolvedValueOnce(
        robots("User-agent: *\nDisallow: /\nAllow: /unit-shop/products/123$")
      )
      .mockResolvedValue(html());
    await collector.collect(naverTestUrl);
    await expect(collector.collect(naverOtherTestUrl)).rejects.toThrow(
      "ROBOTS_NOT_ALLOWED"
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it.each([
    [401, "AUTHENTICATION_FAILED"],
    [403, "ACCESS_BLOCKED"],
    [418, "ACCESS_BLOCKED"],
    [429, "RATE_LIMITED"],
  ])("stops after HTTP %s without retry", async (status, code) => {
    const { collector, fetchFn } = setup();
    fetchFn
      .mockReset()
      .mockResolvedValueOnce(robots())
      .mockResolvedValue(
        new Response("secret provider body", { status: Number(status) })
      );
    await expect(collector.collect(naverTestUrl)).rejects.toThrow(String(code));
    await expect(collector.collect(naverOtherTestUrl)).rejects.toThrow(
      "SOURCE_ACCESS_BLOCKED"
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it.each(["https://evil.example/", naverOtherTestUrl])(
    "rejects redirects including %s",
    async location => {
      const { collector, fetchFn } = setup();
      fetchFn
        .mockReset()
        .mockResolvedValueOnce(robots())
        .mockResolvedValue(
          new Response(null, { status: 302, headers: { location } })
        );
      await expect(collector.collect(naverTestUrl)).rejects.toThrow(
        "REDIRECT_NOT_ALLOWED"
      );
      expect(fetchFn).toHaveBeenCalledTimes(2);
    }
  );
  it("rejects wrong content type and encoded/non-UTF8 HTML", async () => {
    for (const type of ["application/json", "text/html; charset=euc-kr"]) {
      const { collector, fetchFn } = setup();
      fetchFn
        .mockReset()
        .mockResolvedValueOnce(robots())
        .mockResolvedValue(
          new Response("invalid", { headers: { "content-type": type } })
        );
      await expect(collector.collect(naverTestUrl)).rejects.toThrow(
        "INVALID_CONTENT_TYPE"
      );
    }
  });
  it("bounds declared and streamed response sizes", async () => {
    for (const response of [
      new Response("small", {
        headers: { "content-type": "text/html", "content-length": "2000001" },
      }),
      html("가".repeat(700000)),
    ]) {
      const { collector, fetchFn } = setup();
      fetchFn
        .mockReset()
        .mockResolvedValueOnce(robots())
        .mockResolvedValue(response);
      await expect(collector.collect(naverTestUrl)).rejects.toThrow(
        "RESPONSE_TOO_LARGE"
      );
    }
  });
  it("bounds a stalled response header AND a stalled body with timeout", async () => {
    for (const fetchFn of [
      vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {})),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            new ReadableStream({ pull: () => new Promise(() => {}) }),
            { headers: { "content-type": "text/plain" } }
          )
        ),
    ]) {
      const collector = createNaverHtmlCollector({
        ...naverTestOptions,
        fetchFn,
        timeoutMs: 5,
      });
      await expect(collector.collect(naverTestUrl)).rejects.toThrow("TIMEOUT");
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
  });
  it("counts robots in limits and sanitizes transient network failures", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(robots());
    const collector = createNaverHtmlCollector({
      ...naverTestOptions,
      fetchFn,
      policies: { NAVER: { ...naverTestPolicy, maxRequestsPerRun: 1 } },
    });
    await expect(collector.collect(naverTestUrl)).rejects.toThrow(
      "SOURCE_RUN_LIMIT"
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const failed = createNaverHtmlCollector({
      ...naverTestOptions,
      fetchFn: vi.fn().mockRejectedValue(new Error("secret network details")),
    });
    await expect(failed.collect(naverTestUrl)).rejects.toThrow(
      "UPSTREAM_UNAVAILABLE"
    );
  });
  it("serializes concurrent callers and applies the approved minimum delay", async () => {
    let active = 0,
      maxActive = 0;
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async url => {
      active++;
      maxActive = Math.max(active, maxActive);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      return String(url).endsWith("robots.txt") ? robots() : html();
    });
    const sleep = vi.fn(async (_ms: number) => {});
    const collector = createNaverHtmlCollector({
      ...naverTestOptions,
      fetchFn,
      sleep,
      policies: { NAVER: { ...naverTestPolicy, minDelayMs: 2500 } },
    });
    await Promise.all([
      collector.collect(naverTestUrl),
      collector.collect(naverOtherTestUrl),
    ]);
    expect(maxActive).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2500], [2500]]);
  });
});
