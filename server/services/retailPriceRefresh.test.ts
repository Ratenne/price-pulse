import { describe, it, expect, vi } from "vitest";
import { refreshRetailPrices } from "./retailPriceRefresh";
import { retailApiHttpError } from "../integrations/retail/retailApiError";
import { RetailFetchError } from "../integrations/retail/retailClient";
import type { RetailCollection } from "../integrations/retail/retailPrice";
import { RETAILERS } from "../../shared/retailPrices";
import type { RetailPolicies } from "../integrations/retail/retailPolicy";
import type { RetailLink } from "../integrations/retail/retailPrice";
const link: RetailLink = {
  id: 1,
  version: 1,
  productId: "gpu",
  productName: "GPU",
  listingName: "GPU",
  source: "11ST",
  url: "https://www.11st.co.kr/products/1",
};
function setup(links: RetailLink[]) {
  return {
    due: vi.fn().mockResolvedValue(links),
    save: vi.fn().mockResolvedValue(true),
    failed: vi.fn().mockResolvedValue(undefined),
  };
}
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const sleep = vi.fn().mockResolvedValue(undefined);
const policy = {
  approvalStatus: "approved",
  methods: ["API", "IMPORT"],
  apiAvailable: true,
  accessGranted: true,
  thirdPartyProductsAllowed: true,
  storageAllowed: true,
  historyAnalysisAllowed: true,
  redisplayAllowed: true,
  usageLimitsVerified: true,
  termsUrl: "https://provider.example/terms",
  evidence: "test-only approval",
  approvedBy: "test reviewer",
  verifiedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
  maxRequestsPerRun: 10,
  minDelayMs: 1500,
  requiresFixedIp: false,
  credentialEnvNames: ["RETAIL_TEST_KEY"],
};
const policies: RetailPolicies = { "11ST": policy, NAVER: policy };
const enabled = { RETAIL_11ST_ENABLED: "true", RETAIL_NAVER_ENABLED: "true" };
const env = { ...enabled, RETAIL_TEST_KEY: "test-secret" };
const offer: RetailCollection = {
  source: link.source,
  url: link.url,
  externalProductId: "1",
  method: "API",
  dataSource: "test-approved-api",
  listingId: 1,
  title: "GPU",
  itemPrice: 100000,
  shippingFee: 0,
  currency: "KRW" as const,
  condition: "NEW" as const,
  availability: "IN_STOCK" as const,
  conditional: false as const,
  observedAt: new Date().toISOString(),
};
describe("retail price refresh", () => {
  it("skips every unapproved source before the collector or any writes, even with keys", async () => {
    const links = Object.keys(RETAILERS).map((source, i) => ({
      ...link,
      id: i + 1,
      source,
    })) as RetailLink[];
    const repository = setup(links);
    const collect = vi.fn();
    const result = await refreshRetailPrices(repository, logger, {
      collect,
      env: {
        ...env,
        RETAIL_COUPANG_ENABLED: "true",
        RETAIL_GMARKET_ENABLED: "true",
        RETAIL_AUCTION_ENABLED: "true",
      },
      sleep,
    });
    expect(result).toMatchObject({
      skipStatuses: { NOT_APPROVED: 5 },
      targeted: 5,
      succeeded: 0,
      updated: 0,
      failed: 0,
      skipped: 5,
    });
    expect(collect).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.failed).not.toHaveBeenCalled();
  });
  it("does not call an approved collector until explicitly enabled", async () => {
    const repository = setup([link]);
    const collect = vi.fn();
    expect(
      await refreshRetailPrices(repository, logger, {
        policies,
        env: { RETAIL_TEST_KEY: "test-secret" },
        collect,
      })
    ).toMatchObject({
      skipped: 1,
      succeeded: 0,
      skipStatuses: { NOT_CONFIGURED: 1 },
    });
    expect(collect).not.toHaveBeenCalled();
    expect(repository.failed).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
  it("reports distinct missing credentials and unsupported adapter states", async () => {
    for (const [runtimeEnv, status] of [
      [enabled, "NOT_CONFIGURED"],
      [env, "UNSUPPORTED"],
    ] as const) {
      const repository = setup([link]);
      expect(
        await refreshRetailPrices(repository, logger, {
          policies,
          env: runtimeEnv,
        })
      ).toMatchObject({
        skipped: 1,
        succeeded: 0,
        skipStatuses: { [status]: 1 },
      });
      expect(repository.failed).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    }
  });
  it("requires both credentials and an implemented adapter after approval", async () => {
    for (const options of [
      { policies, env: enabled },
      { policies, env },
    ]) {
      const repository = setup([link]);
      expect(
        await refreshRetailPrices(repository, logger, options)
      ).toMatchObject({ skipped: 1, succeeded: 0 });
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.failed).not.toHaveBeenCalled();
    }
  });
  it("enforces approved per-run limits and request intervals", async () => {
    const repository = setup([link, link, link]);
    const collect = vi.fn().mockResolvedValue(offer);
    const pause = vi.fn().mockResolvedValue(undefined);
    expect(
      await refreshRetailPrices(repository, logger, {
        policies: {
          "11ST": { ...policy, maxRequestsPerRun: 2, minDelayMs: 4000 },
        },
        env,
        collect,
        sleep: pause,
      })
    ).toMatchObject({ succeeded: 2, skipped: 1 });
    expect(collect).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledExactlyOnceWith(4000);
  });
  it("does not fabricate missing shipping or observation time", async () => {
    for (const patch of [
      { shippingFee: undefined },
      { observedAt: undefined },
    ]) {
      const repository = setup([link]);
      expect(
        await refreshRetailPrices(repository, logger, {
          policies,
          env,
          collect: async () => ({ ...offer, ...patch }),
          sleep,
        })
      ).toMatchObject({ failed: 1, succeeded: 0 });
      expect(repository.save).not.toHaveBeenCalled();
    }
  });
  it("stops a blocked retailer, continues other sources and counts partial failures", async () => {
    const repository = setup([
      link,
      { ...link, id: 2 },
      { ...link, id: 3, source: "NAVER" },
    ]);
    const collect = vi
      .fn()
      .mockRejectedValueOnce(new RetailFetchError("ACCESS_BLOCKED"))
      .mockResolvedValue({ ...offer, listingId: 3, source: "NAVER" });
    const result = await refreshRetailPrices(repository, logger, {
      collect,
      policies,
      env,
      sleep,
    });
    expect(result).toMatchObject({
      targeted: 3,
      succeeded: 1,
      failed: 1,
      skipped: 1,
      blockedSources: ["11ST"],
    });
    expect(collect).toHaveBeenCalledTimes(2);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save.mock.calls[0][2]).toBe("IMPORT");
  });
  it.each([401, 403, 429])(
    "stops a source after mock HTTP %s and preserves stored prices",
    async status => {
      const repository = setup([link, { ...link, id: 2 }]);
      const httpMock = vi
        .fn()
        .mockResolvedValue(new Response("upstream secrets", { status }));
      const collect = async () => {
        const response = await httpMock();
        throw retailApiHttpError(response.status);
      };
      expect(
        await refreshRetailPrices(repository, logger, {
          policies,
          env,
          collect,
          sleep,
        })
      ).toMatchObject({
        succeeded: 0,
        failed: 1,
        skipped: 1,
        blockedSources: ["11ST"],
      });
      expect(httpMock).toHaveBeenCalledTimes(1);
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.failed.mock.calls[0][1]).not.toBe("UNAVAILABLE_OFFER");
    }
  );
  it("aborts on DB save failure and never marks it as a collection failure", async () => {
    const repository = setup([link]);
    repository.save.mockRejectedValue(new Error("DB down"));
    await expect(
      refreshRetailPrices(repository, logger, {
        policies,
        env,
        collect: async () => offer,
        sleep,
      })
    ).rejects.toThrow("DB down");
    expect(repository.failed).not.toHaveBeenCalled();
  });
  it("does not save invalid or mismatched offers", async () => {
    const repository = setup([link]);
    expect(
      await refreshRetailPrices(repository, logger, {
        policies,
        env,
        collect: async () => ({ ...offer, title: "GPU Ti" }),
        sleep,
      })
    ).toMatchObject({ failed: 1, succeeded: 0 });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
