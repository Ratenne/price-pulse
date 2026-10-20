import { describe, expect, it, vi } from "vitest";
import { refreshNaverProducts } from "./naverProductRefresh";
import { RetailFetchError } from "../integrations/retail/retailClient";
import { retailProductInputSchema } from "../domain/retailProduct";
import {
  naverTestOptions,
  naverTestUrl,
  naverOtherTestUrl,
  naverTestNow,
} from "../integrations/retail/__fixtures__/naverTestSupport";
import type {
  NaverProductParser,
  NaverHtmlPage,
} from "../integrations/retail/naverParser";
const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const normalized = (url = naverTestUrl) =>
  retailProductInputSchema.parse({
    source: "NAVER",
    method: "CRAWL",
    url,
    dataSource: url,
    // Explicit synthetic listing identifier, not an inferred Naver namespace.
    externalProductId: "test-only-seller-listing-123",
    title: "Test GPU",
    availability: "IN_STOCK",
    observedAt: naverTestNow.toISOString(),
  });
const repo = () => ({
  upsert: vi
    .fn()
    .mockResolvedValue({
      status: "MATCHED",
      productId: "existing",
      listingId: 1,
      updated: true,
    }),
});
const collector = () => ({
  collect: vi
    .fn()
    .mockImplementation(async (url: string) => ({
      url,
      html: "synthetic unused transport data",
      observedAt: naverTestNow.toISOString(),
    })),
});
const syntheticParser: NaverProductParser = {
  verified: true,
  // This test dependency does NOT parse HTML or represent a working Naver parser.
  parse: (page: NaverHtmlPage) => ({
    status: "PARSED",
    input: normalized(page.url),
  }),
};
describe("Naver pipeline reuses Phase 2; synthetic normalized inputs only", () => {
  it("keeps the default parser unsupported even with a synthetic complete approval", async () => {
    const repository = repo(),
      transport = collector();
    const result = await refreshNaverProducts(
      repository,
      log(),
      [naverTestUrl],
      { ...naverTestOptions, collector: transport }
    );
    expect(result).toMatchObject({
      succeeded: 0,
      skipped: 1,
      fetched: 0,
      skipStatuses: { UNSUPPORTED: 1 },
    });
    expect(transport.collect).not.toHaveBeenCalled();
    expect(repository.upsert).not.toHaveBeenCalled();
  });
  it("blocks missing enablement and pending approval before HTTP or DB", async () => {
    for (const options of [{ env: {} }, { env: naverTestOptions.env }]) {
      const repository = repo(),
        transport = collector();
      expect(
        await refreshNaverProducts(repository, log(), [naverTestUrl], {
          ...options,
          parser: syntheticParser,
          collector: transport,
        })
      ).toMatchObject({ skipped: 1, succeeded: 0, fetched: 0 });
      expect(transport.collect).not.toHaveBeenCalled();
      expect(repository.upsert).not.toHaveBeenCalled();
    }
  });
  it("uses the existing product service and removes duplicate target requests", async () => {
    const repository = repo(),
      transport = collector();
    const result = await refreshNaverProducts(
      repository,
      log(),
      [naverTestUrl, naverTestUrl],
      {
        ...naverTestOptions,
        parser: syntheticParser,
        collector: transport,
        reviews: [],
      }
    );
    expect(result).toMatchObject({
      succeeded: 1,
      matched: 1,
      updated: 1,
      fetched: 1,
      skipped: 1,
    });
    expect(transport.collect).toHaveBeenCalledTimes(1);
    expect(repository.upsert).toHaveBeenCalledWith(
      normalized(),
      undefined,
      naverTestNow
    );
  });
  it("separates unverified identities held by Phase 2 from successful observations", async () => {
    const repository = repo();
    repository.upsert.mockResolvedValue({
      status: "HELD",
      reason: "INCOMPLETE_IDENTITY",
      candidates: [],
    });
    expect(
      await refreshNaverProducts(repository, log(), [naverTestUrl], {
        ...naverTestOptions,
        parser: syntheticParser,
        collector: collector(),
      })
    ).toMatchObject({ held: 1, succeeded: 0, updated: 0 });
  });
  it("never trusts HTML to approve a product review or change observation provenance", async () => {
    for (const patch of [
      { source: "11ST" },
      { method: "IMPORT" },
      { dataSource: "provider assertion" },
      { observedAt: "2026-10-19T00:00:00Z" },
      { approvalStatus: "approved" },
      { url: naverOtherTestUrl },
    ]) {
      const repository = repo();
      const parser: NaverProductParser = {
        verified: true,
        parse: () => ({
          status: "PARSED",
          input: { ...normalized(), ...patch } as any,
        }),
      };
      expect(
        await refreshNaverProducts(repository, log(), [naverTestUrl], {
          ...naverTestOptions,
          parser,
          collector: collector(),
        })
      ).toMatchObject({ failed: 1, succeeded: 0 });
      expect(repository.upsert).not.toHaveBeenCalled();
    }
  });
  it("keeps parser failures and unsupported structure out of persistence", async () => {
    for (const parsed of [
      { status: "UNSUPPORTED", code: "NAVER_PRODUCT_HTML_UNVERIFIED" },
      { status: "REJECTED", code: "SHIPPING_UNVERIFIED" },
      { status: "REJECTED", code: "PRODUCT_INFORMATION_MISMATCH" },
    ] as const) {
      const repository = repo();
      const parser = { verified: true, parse: () => parsed };
      const result = await refreshNaverProducts(
        repository,
        log(),
        [naverTestUrl],
        { ...naverTestOptions, parser, collector: collector() }
      );
      expect(result.succeeded).toBe(0);
      expect(result.skipped + result.failed).toBe(1);
      expect(repository.upsert).not.toHaveBeenCalled();
    }
  });
  it.each(["AUTHENTICATION_FAILED", "ACCESS_BLOCKED", "RATE_LIMITED"])(
    "stops the Naver source after %s without storing stock-out",
    async code => {
      const repository = repo(),
        transport = collector();
      transport.collect.mockRejectedValue(new RetailFetchError(code));
      expect(
        await refreshNaverProducts(
          repository,
          log(),
          [naverTestUrl, naverOtherTestUrl],
          { ...naverTestOptions, parser: syntheticParser, collector: transport }
        )
      ).toMatchObject({ failed: 1, skipped: 1, succeeded: 0 });
      expect(transport.collect).toHaveBeenCalledTimes(1);
      expect(repository.upsert).not.toHaveBeenCalled();
    }
  );
  it("isolates collection and transaction failures and omits raw provider errors from logs", async () => {
    const repository = repo(),
      transport = collector(),
      logger = log();
    transport.collect.mockRejectedValueOnce(
      new Error("provider secret and body")
    );
    expect(
      await refreshNaverProducts(
        repository,
        logger,
        [naverTestUrl, naverOtherTestUrl],
        { ...naverTestOptions, parser: syntheticParser, collector: transport }
      )
    ).toMatchObject({ failed: 1, succeeded: 1, matched: 1 });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      "provider secret"
    );
    repository.upsert.mockRejectedValueOnce(new Error("secret SQL error"));
    expect(
      await refreshNaverProducts(
        repository,
        logger,
        [naverTestUrl, naverOtherTestUrl],
        { ...naverTestOptions, parser: syntheticParser, collector: collector() }
      )
    ).toMatchObject({ failed: 1, succeeded: 1 });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("secret SQL");
  });
});
