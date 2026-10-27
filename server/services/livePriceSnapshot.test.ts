import { describe, expect, it, vi } from "vitest";
import { refreshLivePriceSnapshot } from "./livePriceSnapshot";
import type { LivePriceSnapshotRepository } from "../repositories/livePriceSnapshotRepository";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const checkedAt = "2026-10-16T03:00:00.000Z";
function repo(): LivePriceSnapshotRepository {
  return {
    countMappedProducts: vi.fn(async () => 4),
    findTrackedProducts: vi.fn(async () => []),
    findProductsWithoutHistory: vi.fn(async () => []),
    applyPrices: vi.fn(async prices => ({
      updated: prices.size,
      outcomes: [],
    })),
    recordUnobserved: vi.fn(async () => ({ failed: 1 })),
  };
}
describe("live price snapshot refresh", () => {
  it("persists selected fetch failure reasons and counts them separately", async () => {
    const repository = repo();
    vi.mocked(repository.recordUnobserved)
      .mockResolvedValueOnce({ failed: 1 })
      .mockResolvedValueOnce({ failed: 0 });
    const summary = await refreshLivePriceSnapshot(
      async () => ({
        prices: new Map(),
        checkedAt,
        failures: new Map([["1", "HTTP"]]),
      }),
      repository,
      logger,
      ["1"]
    );
    expect(repository.recordUnobserved).toHaveBeenNthCalledWith(
      1,
      [],
      checkedAt,
      "HTTP",
      ["1"]
    );
    expect(summary.failed).toBe(1);
  });
  it("passes actual page observation times and records missing confirmations without clearing prices", async () => {
    const repository = repo();
    const prices = new Map([["1", 100]]);
    const details = new Map([
      ["1", { observedAt: checkedAt, shippingFee: null }],
    ]);
    const summary = await refreshLivePriceSnapshot(
      async () => ({ prices, details, checkedAt }),
      repository,
      logger
    );
    expect(repository.applyPrices).toHaveBeenCalledWith(
      prices,
      checkedAt,
      details
    );
    expect(repository.recordUnobserved).toHaveBeenCalledWith(
      ["1"],
      checkedAt,
      "NOT_OBSERVED_IN_VALID_LIST",
      undefined
    );
    expect(summary).toEqual({ tracked: 4, fetched: 1, updated: 1, failed: 1 });
  });
  it("does not mark unrelated products as failures during missing-history repair", async () => {
    const repository = repo();
    await refreshLivePriceSnapshot(
      async () => ({ prices: new Map(), checkedAt }),
      repository,
      logger,
      ["1"]
    );
    expect(repository.countMappedProducts).not.toHaveBeenCalled();
    expect(repository.recordUnobserved).toHaveBeenCalledWith(
      [],
      checkedAt,
      "NOT_OBSERVED_IN_VALID_LIST",
      ["1"]
    );
  });
  it("records failure but writes no price/history when the crawl fails", async () => {
    const repository = repo();
    await expect(
      refreshLivePriceSnapshot(
        async () => {
          throw new Error("network failure");
        },
        repository,
        logger
      )
    ).rejects.toThrow("network failure");
    expect(repository.applyPrices).not.toHaveBeenCalled();
    expect(repository.recordUnobserved).toHaveBeenCalledWith(
      [],
      expect.any(String),
      "NETWORK_OR_RESPONSE",
      undefined
    );
  });
  it("does not misclassify a persistence error as a fetch failure", async () => {
    const repository = repo();
    vi.mocked(repository.applyPrices).mockRejectedValue(
      new Error("DB failure")
    );
    await expect(
      refreshLivePriceSnapshot(
        async () => ({ prices: new Map([["1", 100]]), checkedAt }),
        repository,
        logger
      )
    ).rejects.toThrow("DB failure");
    expect(repository.recordUnobserved).not.toHaveBeenCalled();
  });
});
