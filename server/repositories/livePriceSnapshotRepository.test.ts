import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgLivePriceSnapshotRepository } from "./livePriceSnapshotRepository";

describe("PgLivePriceSnapshotRepository", () => {
  it("writes every price in one statement", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 2 });
    const repository = new PgLivePriceSnapshotRepository({
      query,
    } as unknown as Pool);
    const result = await repository.applyPrices(
      new Map([
        ["1", 100],
        ["2", 200],
      ]),
      "2026-10-16T03:00:00.000Z"
    );
    expect(result).toEqual({ updated: 2 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      "unnest($1::text[], $2::bigint[])"
    );
    expect(query.mock.calls[0][1]).toEqual([
      ["1", "2"],
      [100, 200],
      "2026-10-16T03:00:00.000Z",
    ]);
  });
  it("does not touch the database for an empty price list", async () => {
    const query = vi.fn();
    const repository = new PgLivePriceSnapshotRepository({
      query,
    } as unknown as Pool);
    expect(await repository.applyPrices(new Map(), "x")).toEqual({
      updated: 0,
    });
    expect(query).not.toHaveBeenCalled();
  });
});
