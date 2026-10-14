function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function nonNegativeInteger(
  value: string | undefined,
  fallback: number,
  name: string
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

export interface DanawaBulkBackfillConfig {
  requestDelayMs: number;
  maxConcurrency: number;
  retryCount: number;
  retryBackoffMs: number;
  requestTimeoutMs: number;
  batchSize: number;
  listCount: number;
  targetHistoricalRowCount: number;
}

export function createDanawaBulkBackfillConfig(
  env: NodeJS.ProcessEnv = process.env
): DanawaBulkBackfillConfig {
  const maxConcurrency = positiveInteger(
    env.DANAWA_MAX_CONCURRENCY,
    1,
    "DANAWA_MAX_CONCURRENCY"
  );
  if (maxConcurrency > 5) {
    throw new Error("DANAWA_MAX_CONCURRENCY cannot exceed 5");
  }
  return {
    requestDelayMs: positiveInteger(
      env.DANAWA_REQUEST_DELAY_MS,
      1_000,
      "DANAWA_REQUEST_DELAY_MS"
    ),
    maxConcurrency,
    retryCount: nonNegativeInteger(
      env.DANAWA_RETRY_COUNT,
      2,
      "DANAWA_RETRY_COUNT"
    ),
    retryBackoffMs: positiveInteger(
      env.DANAWA_RETRY_BACKOFF_MS,
      2_000,
      "DANAWA_RETRY_BACKOFF_MS"
    ),
    requestTimeoutMs: positiveInteger(
      env.DANAWA_REQUEST_TIMEOUT_MS,
      10_000,
      "DANAWA_REQUEST_TIMEOUT_MS"
    ),
    batchSize: positiveInteger(env.DANAWA_BATCH_SIZE, 30, "DANAWA_BATCH_SIZE"),
    listCount: positiveInteger(env.DANAWA_LIST_COUNT, 30, "DANAWA_LIST_COUNT"),
    targetHistoricalRowCount: positiveInteger(
      env.DANAWA_TARGET_PRICE_COUNT,
      10_000,
      "DANAWA_TARGET_PRICE_COUNT"
    ),
  };
}
