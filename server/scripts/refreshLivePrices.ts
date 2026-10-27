import { performance } from "node:perf_hooks";
import { getDatabasePool, closeDatabasePool } from "../config/database.js";
import {
  fetchLivePrices,
  readSelectedLivePrices,
} from "../integrations/danawa/danawaLivePrices.js";
import { PgLivePriceSnapshotRepository } from "../repositories/livePriceSnapshotRepository.js";
import {
  livePriceExitCode,
  refreshTrackedLivePriceSnapshot,
} from "../services/livePriceSnapshot.js";
import { consoleLogger, type Logger } from "../logging/logger.js";
import { writeLivePriceStepSummary } from "../logging/livePriceStepSummary.js";

async function main() {
  const startedAt = performance.now();
  let exitCode = 1;
  let report: Record<string, unknown> = {
    executionStatus: "FAILED",
    stage: "INITIALIZE",
  };
  const logger: Logger = {
    info: (message, context) => consoleLogger.info(message, context),
    warn: (message, context) => consoleLogger.warn(message, context),
    error: (message, context) => {
      consoleLogger.error(message, context);
      if (context?.executionStatus === "FAILED") report = context;
    },
  };
  try {
    const repository = new PgLivePriceSnapshotRepository(getDatabasePool());
    const missingMode = process.argv.includes("--missing-history");
    const summary = await refreshTrackedLivePriceSnapshot(
      missingMode
        ? async () => ({
            prices: new Map(),
            checkedAt: new Date().toISOString(),
          })
        : fetchLivePrices,
      readSelectedLivePrices,
      repository,
      logger,
      missingMode ? () => repository.findProductsWithoutHistory() : undefined
    );
    report = summary;
    exitCode = livePriceExitCode(summary.executionStatus);
  } catch (error) {
    consoleLogger.error("Live price snapshot refresh failed", {
      executionStatus: "FAILED",
      exceptionType: error instanceof Error ? error.name : typeof error,
    });
    exitCode = 1;
  } finally {
    try {
      await closeDatabasePool();
    } catch (error) {
      consoleLogger.error("Live price database pool close failed", {
        executionStatus: "FAILED",
        exceptionType: error instanceof Error ? error.name : typeof error,
      });
      report = {
        ...report,
        executionStatus: "FAILED",
        stage: "CLOSE_DATABASE_POOL",
        failureType: "STORAGE_ERROR",
      };
      exitCode = 1;
    }
    const durations =
      typeof report.durationsMs === "object" && report.durationsMs !== null
        ? report.durationsMs
        : {};
    report = {
      ...report,
      durationsMs: {
        ...durations,
        processTotal: Math.round(performance.now() - startedAt),
      },
    };
    consoleLogger.info("Live price execution completed", {
      executionStatus: report.executionStatus,
      exitCode,
      durationsMs: report.durationsMs,
    });
    await writeLivePriceStepSummary(
      process.env.GITHUB_STEP_SUMMARY,
      report,
      consoleLogger
    );
    process.exitCode = exitCode;
  }
}
void main();
