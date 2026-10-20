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

function describeShape(value: unknown, depth = 0): unknown {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      firstItemShape: depth < 3 && value.length > 0
        ? describeShape(value[0], depth + 1)
        : undefined,
    };
  }
  if (isRecord(value)) {
    return {
      type: "object",
      fields: Object.fromEntries(
        Object.entries(value).slice(0, 40).map(([key, child]) => [
          key,
          depth < 3 ? describeShape(child, depth + 1) : {
            type: Array.isArray(child) ? "array" : child === null ? "null" : typeof child,
          },
        ])
      ),
      fieldCount: Object.keys(value).length,
    };
  }
  return { type: typeof value };
}

function describePeriod(response: unknown, key: "24" | "12" | "6") {
  if (!isRecord(response)) return { period: key, exists: false, periodType: typeof response };
  const exists = Object.prototype.hasOwnProperty.call(response, key);
  const period = response[key];
  const result = isRecord(period) ? period.result : undefined;
  return {
    period: key,
    exists,
    periodType: period === null ? "null" : Array.isArray(period) ? "array" : typeof period,
    resultType: result === null ? "null" : Array.isArray(result) ? "array" : typeof result,
    resultCount: Array.isArray(result) ? result.length : undefined,
    resultRowTypes: Array.isArray(result)
      ? Array.from(new Set(result.map(row => row === null ? "null" : Array.isArray(row) ? "array" : typeof row)))
      : undefined,
    resultFieldTypes: Array.isArray(result)
      ? {
          date: Array.from(new Set(result.filter(isRecord).map(row => row.date === null ? "null" : typeof row.date))),
          minPrice: Array.from(new Set(result.filter(isRecord).map(row => row.minPrice === null ? "null" : typeof row.minPrice))),
        }
      : undefined,
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

  logger.warn("Danawa historical response has no valid monthly period", {
    responseKeys: Object.keys(typedResponse).slice(0, 30),
    responseStructure: describeShape(typedResponse),
    periods: (["24", "12", "6"] as const).map(key => describePeriod(typedResponse, key)),
    invalidRows: invalidCount,
  });

  throw new DanawaIntegrationError(
    "Danawa response contained no valid monthly 24, 12, or 6 period",
    "PARSE"
  );
}

export const parseDanawaSixMonthPrices = parseDanawaMonthlyPrices;
