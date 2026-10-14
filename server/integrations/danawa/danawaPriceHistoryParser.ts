import type { HistoricalPriceCollection } from "../../domain/historicalPrice";
import type { Logger } from "../../logging/logger";
import { DanawaIntegrationError } from "./danawaErrors";
import type {
  DanawaPeriodPriceResponse,
  DanawaPriceHistoryResponse,
  DanawaPricePointResponse,
} from "./danawaPriceHistoryDto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseYearMonth(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{2})-(0[1-9]|1[0-2])$/.exec(value);
  return match ? `20${match[1]}-${match[2]}` : undefined;
}

function isValidPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function asResponse(response: unknown): DanawaPriceHistoryResponse {
  if (!isRecord(response)) {
    throw new DanawaIntegrationError(
      "Danawa response must be a JSON object",
      "PARSE"
    );
  }
  return response as DanawaPriceHistoryResponse;
}

function parsePeriodRows(
  rows: DanawaPricePointResponse[],
  period: 24 | 12 | 6,
  logger: Pick<Logger, "warn">
) {
  const pricesByMonth = new Map<
    string,
    HistoricalPriceCollection["prices"][number]
  >();
  let invalidCount = 0;

  rows.forEach((row, index) => {
    if (!isRecord(row)) {
      invalidCount += 1;
      logger.warn("Skipping invalid Danawa historical price row", {
        index,
        period,
        reason: "ROW_NOT_OBJECT",
      });
      return;
    }

    const priceYearMonth = parseYearMonth(row.date);
    if (!priceYearMonth || !isValidPrice(row.minPrice)) {
      invalidCount += 1;
      logger.warn("Skipping invalid Danawa historical price row", {
        index,
        period,
        reason: !priceYearMonth ? "INVALID_YEAR_MONTH" : "INVALID_PRICE",
      });
      return;
    }

    if (pricesByMonth.has(priceYearMonth)) {
      invalidCount += 1;
      logger.warn("Replacing duplicate Danawa historical price month", {
        index,
        period,
        priceYearMonth,
      });
    }

    pricesByMonth.set(priceYearMonth, {
      price: row.minPrice,
      priceYearMonth,
      granularity: "MONTH",
      sourceType: "HISTORICAL_IMPORT",
    });
  });

  return {
    prices: Array.from(pricesByMonth.values()),
    invalidCount,
  };
}

export function parseDanawaMonthlyPrices(
  response: unknown,
  logger: Pick<Logger, "warn">
): HistoricalPriceCollection {
  const typedResponse = asResponse(response);
  let invalidCount = 0;

  for (const selectedPeriod of [24, 12, 6] as const) {
    const period = typedResponse[String(selectedPeriod) as "24" | "12" | "6"];
    if (
      !isRecord(period) ||
      !Array.isArray(period.result) ||
      period.result.length === 0
    ) {
      continue;
    }
    const parsed = parsePeriodRows(period.result, selectedPeriod, logger);
    invalidCount += parsed.invalidCount;
    if (parsed.prices.length > 0) {
      return {
        prices: parsed.prices,
        receivedCount: period.result.length,
        invalidCount,
        selectedPeriod,
      };
    }
  }

  throw new DanawaIntegrationError(
    "Danawa response contained no valid monthly 24, 12, or 6 period",
    "PARSE"
  );
}

export const parseDanawaSixMonthPrices = parseDanawaMonthlyPrices;
