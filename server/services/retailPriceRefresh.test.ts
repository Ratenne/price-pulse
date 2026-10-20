import { describe, it, expect, vi } from "vitest";
import { refreshRetailPrices } from "./retailPriceRefresh";
import { RetailFetchError } from "../integrations/retail/retailClient";
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
const offer = {
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
  it("stops a blocked retailer, continues other sources and counts partial failures", async () => {
    const repository = setup([
      link,
      { ...link, id: 2 },
      { ...link, id: 3, source: "NAVER" },
    ]);
    const collect = vi
      .fn()
      .mockRejectedValueOnce(new RetailFetchError("ACCESS_BLOCKED"))
      .mockResolvedValue({ ...offer, listingId: 3 });
    const result = await refreshRetailPrices(repository, logger, {
      collect,
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
  });
  it("aborts on DB save failure and never marks it as a collection failure", async () => {
    const repository = setup([link]);
    repository.save.mockRejectedValue(new Error("DB down"));
    await expect(
      refreshRetailPrices(repository, logger, {
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
        collect: async () => ({ ...offer, title: "GPU Ti" }),
        sleep,
      })
    ).toMatchObject({ failed: 1, succeeded: 0 });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
