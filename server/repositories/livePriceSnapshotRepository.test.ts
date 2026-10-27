import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgLivePriceSnapshotRepository } from "./livePriceSnapshotRepository";

describe("PgLivePriceSnapshotRepository transaction failures", () => {
  it("rolls back and releases a connection on persistence failure", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT product_id"))
        return { rows: [{ product_id: "internal" }], rowCount: 1 };
      if (sql.includes("SELECT item_price")) throw new Error("DB unavailable");
      return { rows: [], rowCount: 0 };
    });
    const release = vi.fn();
    const repository = new PgLivePriceSnapshotRepository({
      connect: async () => ({ query, release }),
    } as unknown as Pool);
    await expect(
      repository.applyPrices(new Map([["123", 100]]), "2026-10-16T03:00:00Z")
    ).rejects.toThrow("DB unavailable");
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });
  it.each([0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid fresh price %s before touching the DB",
    async price => {
      const connect = vi.fn();
      const repository = new PgLivePriceSnapshotRepository({
        connect,
      } as unknown as Pool);
      await expect(
        repository.applyPrices(new Map([["1", price]]), "2026-10-16T03:00:00Z")
      ).rejects.toThrow("INVALID_OBSERVATION");
      expect(connect).not.toHaveBeenCalled();
    }
  );
  it("does not touch the database for an empty price list", async () => {
    const connect = vi.fn();
    const repository = new PgLivePriceSnapshotRepository({
      connect,
    } as unknown as Pool);
    expect(await repository.applyPrices(new Map(), "x")).toEqual({
      updated: 0,
      outcomes: [],
    });
    expect(connect).not.toHaveBeenCalled();
  });
  it("does not save a price if the tracked mapping changed", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT product_id"))
        return { rows: [{ product_id: "other" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const repository = new PgLivePriceSnapshotRepository({
      connect: async () => ({ query, release() {} }),
    } as unknown as Pool);
    expect(
      await repository.applyPrices(
        new Map([["123", 100]]),
        "2026-10-16T03:00:00Z",
        undefined,
        new Map([["123", "original"]])
      )
    ).toEqual({
      updated: 0,
      outcomes: [
        {
          externalId: "123",
          productId: "other",
          status: "SKIPPED",
          reason: "MAPPING_CHANGED",
        },
      ],
      skipped: [
        { externalId: "123", productId: "other", reason: "MAPPING_CHANGED" },
      ],
    });
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE products"),
      expect.anything()
    );
  });
  it("rejects duplicate mappings instead of choosing one product", async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes("SELECT product_id")
        ? { rows: [{ product_id: "a" }, { product_id: "b" }], rowCount: 2 }
        : { rows: [], rowCount: 0 }
    );
    const repository = new PgLivePriceSnapshotRepository({
      connect: async () => ({ query, release() {} }),
    } as unknown as Pool);
    await expect(
      repository.applyPrices(new Map([["123", 100]]), "2026-10-16T03:00:00Z")
    ).rejects.toThrow("AMBIGUOUS_DANAWA_MAPPING");
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("reports connection failures with the external ID and storage stage", async () => {
    const repository = new PgLivePriceSnapshotRepository({
      connect: async () => {
        throw new Error("unavailable");
      },
    } as unknown as Pool);
    await expect(
      repository.applyPrices(new Map([["123", 100]]), "2026-10-16T03:00:00Z")
    ).rejects.toMatchObject({
      executionStatus: "FAILED",
      failureType: "STORAGE_ERROR",
      stage: "CONNECT",
      externalId: "123",
      productId: undefined,
    });
  });
});
