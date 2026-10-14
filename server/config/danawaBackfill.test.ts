import { describe, expect, it } from "vitest";
import { createDanawaBulkBackfillConfig } from "./danawaBackfill";

describe("createDanawaBulkBackfillConfig", () => {
  it("uses conservative request defaults", () => {
    expect(createDanawaBulkBackfillConfig({})).toMatchObject({
      requestDelayMs: 1_000,
      maxConcurrency: 1,
      retryCount: 2,
      targetHistoricalRowCount: 10_000,
    });
  });

  it("allows retries to be disabled and rejects excessive concurrency", () => {
    expect(
      createDanawaBulkBackfillConfig({ DANAWA_RETRY_COUNT: "0" }).retryCount
    ).toBe(0);
    expect(() =>
      createDanawaBulkBackfillConfig({ DANAWA_MAX_CONCURRENCY: "6" })
    ).toThrow("cannot exceed 5");
  });
});
