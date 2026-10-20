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
    });
    expect(connect).not.toHaveBeenCalled();
  });
});
