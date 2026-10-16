import { describe, expect, it, vi } from "vitest";
import { refreshLivePriceSnapshot } from "./livePriceSnapshot";
import type { LivePriceSnapshotRepository } from "../repositories/livePriceSnapshotRepository";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const checkedAt = "2026-10-16T03:00:00.000Z";
function repo(tracked: number): LivePriceSnapshotRepository {
  return {
    countMappedProducts: vi.fn(async () => tracked),
    applyPrices: vi.fn(async prices => ({ updated: prices.size })),
    clearMissing: vi.fn(async () => ({ cleared: 2 })),
  };
}
describe("live price snapshot refresh", () => {
  it("stores the whole crawl and clears listings Danawa no longer returns", async () => {
    const repository = repo(4);
    const prices = new Map([
      ["1", 100],
      ["2", 200],
      ["3", 300],
    ]);
    const summary = await refreshLivePriceSnapshot(
      async () => ({ prices, checkedAt }),
      repository,
      logger
    );
    expect(repository.applyPrices).toHaveBeenCalledWith(prices, checkedAt);
    expect(repository.clearMissing).toHaveBeenCalledWith(
      ["1", "2", "3"],
      checkedAt
    );
    expect(summary).toEqual({
      tracked: 4,
      fetched: 3,
      updated: 3,
      cleared: 2,
      clearSkipped: false,
    });
  });
  it("keeps previous prices when the crawl covers too few tracked products", async () => {
    const repository = repo(100);
    const summary = await refreshLivePriceSnapshot(
      async () => ({ prices: new Map([["1", 100]]), checkedAt }),
      repository,
      logger
    );
    expect(repository.clearMissing).not.toHaveBeenCalled();
    expect(summary.clearSkipped).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });
  it("leaves the existing snapshot untouched when the crawl fails", async () => {
    const repository = repo(4);
    await expect(
      refreshLivePriceSnapshot(
        async () => {
          throw new Error("Danawa request failed after retries");
        },
        repository,
        logger
      )
    ).rejects.toThrow("Danawa request failed");
    expect(repository.applyPrices).not.toHaveBeenCalled();
    expect(repository.clearMissing).not.toHaveBeenCalled();
  });
});
