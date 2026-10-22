import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  close: vi.fn(async () => {}),
  pool: vi.fn(() => ({})),
}));
vi.mock("../config/database", () => ({
  getDatabasePool: mocks.pool,
  closeDatabasePool: mocks.close,
}));
vi.mock("../services/danawaBulkBackfillService", async importOriginal => {
  const actual =
    await importOriginal<
      typeof import("../services/danawaBulkBackfillService")
    >();
  return {
    ...actual,
    DanawaBulkBackfillService: class {
      run = mocks.run;
    },
  };
});

describe("bulkBackfillDanawa command exit status", () => {
  const previousExitCode = process.exitCode;
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    process.exitCode = previousExitCode;
    vi.restoreAllMocks();
  });

  it.each([
    [0, 0, 12, 0, "SUCCESS"],
    [0, 0, 0, 0, "SUCCESS"],
    [0, 1, 0, 2, "FAILED"],
    [1, 0, 12, 2, "FAILED"],
  ])(
    "pages=%i history failures=%i current warnings=%i exits %i",
    async (
      failedPages,
      failedProducts,
      currentPriceFailures,
      exitCode,
      executionStatus
    ) => {
      mocks.run.mockResolvedValue({
        failedPages,
        failedProducts,
        currentPriceFailures,
        insertedPrices: 0,
        skippedPrices: 12631,
        targetHistoricalRowCount: 0,
        targetReached: false,
      });
      await import("./bulkBackfillDanawa");
      await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
      expect(process.exitCode).toBe(exitCode);
      const output = JSON.parse(vi.mocked(console.log).mock.calls[0][0]);
      expect(output).toMatchObject({
        executionStatus,
        hasWarnings: currentPriceFailures > 0,
        summary: { insertedPrices: 0, skippedPrices: 12631 },
      });
    }
  );

  it("keeps fatal database errors as exit code 1 and closes the pool", async () => {
    mocks.run.mockRejectedValue(new Error("database connection failed"));
    await import("./bulkBackfillDanawa");
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
    expect(process.exitCode).toBe(1);
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledOnce();
  });
});
