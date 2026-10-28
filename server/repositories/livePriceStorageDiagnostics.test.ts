import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { LivePriceStorageDiagnostics } from "./livePriceStorageDiagnostics";
import { PgLivePriceSnapshotRepository } from "./livePriceSnapshotRepository";

afterEach(() => vi.useRealTimers());

describe("live price storage diagnostics", () => {
  it("reports a pending DB stage and flushes acknowledged results before interruption", async () => {
    vi.useFakeTimers();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    let now = 0;
    const monitor = new LivePriceStorageDiagnostics(
      logger,
      "listSave",
      3,
      () => now
    );
    monitor.startProduct("1");
    monitor.completed({ externalId: "1", productId: "a", status: "COMMITTED" });
    monitor.startProduct("2");
    monitor.setProductId("b");
    monitor.startStage("LOCK_PRODUCT");
    now = 10_000;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(logger.info).toHaveBeenCalledWith(
      "Live price storage progress",
      expect.objectContaining({
        batch: "listSave",
        processed: 1,
        committed: 1,
        confirmedOutcomes: [
          {
            externalId: "1",
            productId: "a",
            status: "COMMITTED",
            reason: undefined,
          },
        ],
      })
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "Live price storage operation still running",
      expect.objectContaining({
        externalId: "2",
        productId: "b",
        stage: "LOCK_PRODUCT",
        durationMs: 10_000,
        committed: 1,
      })
    );
    monitor.startStage("READ_OBSERVATION");
    expect(logger.warn).toHaveBeenCalledWith(
      "Slow live price storage operation",
      expect.objectContaining({ stage: "LOCK_PRODUCT", durationMs: 10_000 })
    );
    monitor.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("logs acknowledged commits in chunks and flushes the final partial chunk", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT product_id"))
        return {
          rows: [{ product_id: `internal-${params?.[0]}` }],
          rowCount: 1,
        };
      if (sql.includes("SELECT item_price")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT 1 FROM price_histories"))
        return { rows: [{}], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const repository = new PgLivePriceSnapshotRepository({
      connect: async () => ({ query, release() {} }),
    } as unknown as Pool);
    const prices = new Map(
      Array.from({ length: 26 }, (_, i) => [String(i + 1), 100])
    );
    const result = await repository.applyPrices(
      prices,
      "2026-10-16T03:00:00Z",
      undefined,
      undefined,
      { logger, batch: "listSave" }
    );
    expect(result.updated).toBe(26);
    const progress = logger.info.mock.calls
      .filter(call => call[0] === "Live price storage progress")
      .map(call => call[1]);
    expect(progress).toHaveLength(2);
    expect(progress[0]).toMatchObject({
      processed: 25,
      committed: 25,
      skipped: 0,
      total: 26,
    });
    expect(progress[0]?.confirmedOutcomes).toHaveLength(25);
    expect(progress[1]).toMatchObject({
      processed: 26,
      committed: 26,
      skipped: 0,
      total: 26,
    });
    expect(progress[1]?.confirmedOutcomes).toEqual([
      expect.objectContaining({
        externalId: "26",
        productId: "internal-26",
        status: "COMMITTED",
      }),
    ]);
  });
  it("flushes only acknowledged commits when a later transaction fails", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT product_id")) {
        if (params?.[0] === "2") throw new Error("injected failure");
        return { rows: [{ product_id: "a" }], rowCount: 1 };
      }
      if (sql.includes("SELECT item_price")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT 1 FROM price_histories"))
        return { rows: [{}], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const repository = new PgLivePriceSnapshotRepository({
      connect: async () => ({ query, release() {} }),
    } as unknown as Pool);
    await expect(
      repository.applyPrices(
        new Map([
          ["1", 100],
          ["2", 100],
        ]),
        "2026-10-16T03:00:00Z",
        undefined,
        undefined,
        { logger, batch: "listSave" }
      )
    ).rejects.toMatchObject({
      externalId: "2",
      stage: "READ_MAPPING",
      failureType: "STORAGE_ERROR",
    });
    expect(logger.info).toHaveBeenCalledWith(
      "Live price storage progress",
      expect.objectContaining({
        processed: 1,
        committed: 1,
        confirmedOutcomes: [
          expect.objectContaining({
            externalId: "1",
            productId: "a",
            status: "COMMITTED",
          }),
        ],
      })
    );
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("does not fail storage when diagnostics output throws", async () => {
    const logger = {
      info: vi.fn(() => {
        throw new Error("logging unavailable");
      }),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT product_id"))
        return { rows: [{ product_id: "a" }], rowCount: 1 };
      if (sql.includes("SELECT item_price")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT 1 FROM price_histories"))
        return { rows: [{}], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const repository = new PgLivePriceSnapshotRepository({
      connect: async () => ({ query, release() {} }),
    } as unknown as Pool);
    const result = await repository.applyPrices(
      new Map([["1", 100]]),
      "2026-10-16T03:00:00Z",
      undefined,
      undefined,
      { logger, batch: "listSave" }
    );
    expect(result.updated).toBe(1);
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(query).not.toHaveBeenCalledWith("ROLLBACK");
  });
});
