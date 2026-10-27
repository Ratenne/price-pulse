import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  formatLivePriceStepSummary,
  writeLivePriceStepSummary,
} from "./livePriceStepSummary";

describe("live price Actions summary", () => {
  it("shows partial state, independent counts, durations and safe reason counts", () => {
    const result = formatLivePriceStepSummary({
      executionStatus: "PARTIAL_SUCCESS",
      tracked: 3,
      mappingRows: 3,
      failed: 1,
      committedProducts: 2,
      storageFailures: 0,
      retryTargets: 2,
      retryObserved: 1,
      failureReasons: { HTTP: 1, "unsafe|secret": 2 },
      durationsMs: { listFetch: 25, total: 60 },
      secret: "secret-token",
    });
    expect(result).toContain("PARTIAL_SUCCESS");
    expect(result).toContain("| 최종 미관측 상품 | 1 |");
    expect(result).toContain("| HTTP | 1 |");
    expect(result).toContain("| listFetch | 25 |");
    expect(result).not.toContain("secret");
  });
  it("does not throw when Actions summary cannot be written", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await expect(
      writeLivePriceStepSummary(
        path.join(tmpdir(), "pricepulse-missing-parent-nonexistent", "summary"),
        { executionStatus: "FAILED" },
        logger
      )
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      "Live price Actions summary could not be written",
      { executionStatus: "FAILED" }
    );
  });
  it("retains a failed process exit and writes a FAILED summary on initialization error", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "pricepulse-summary-"));
    const summaryPath = path.join(directory, "summary.md");
    try {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("DB_"))
      );
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "server/scripts/refreshLivePrices.ts"],
        {
          cwd: new URL("../../", import.meta.url),
          encoding: "utf8",
          timeout: 10000,
          env: {
            ...env,
            DB_URL: "invalid-secret-sentinel",
            GITHUB_STEP_SUMMARY: summaryPath,
          },
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toContain(
        "invalid-secret-sentinel"
      );
      const summary = readFileSync(summaryPath, "utf8");
      expect(summary).toContain("FAILED");
      expect(summary).not.toContain("invalid-secret-sentinel");
    } finally {
      try {
        unlinkSync(summaryPath);
      } catch {}
      rmdirSync(directory);
    }
  });
  it("keeps a nonzero exit when both initialization and summary writing fail", () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("DB_"))
    );
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "server/scripts/refreshLivePrices.ts"],
      {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...env,
          DB_URL: "invalid-secret-sentinel",
          GITHUB_STEP_SUMMARY: path.join(
            tmpdir(),
            "pricepulse-missing-parent-nonexistent",
            "summary"
          ),
        },
      }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "Live price Actions summary could not be written"
    );
    expect(result.stdout + result.stderr).not.toContain(
      "invalid-secret-sentinel"
    );
  });
});
