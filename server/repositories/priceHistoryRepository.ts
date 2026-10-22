import type { Pool } from "pg";
import type { HistoricalPrice, PriceSource } from "../domain/historicalPrice";
import type { CollectionStatus } from "../domain/priceCollection";
import { saveCollectionStatus } from "./priceCollectionStatus";

export interface PriceHistoryWriteResult {
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  // Optional for older repository implementations; absence means unmeasured.
  comparisons?: MonthlyPriceComparison[];
}

export interface MonthlyPriceComparison {
  priceYearMonth: string;
  existingPrice: number;
  incomingPrice: number;
  outcome: "DUPLICATE" | "CONFLICT" | "INCOMPARABLE";
  reason:
    | "SAME_MONTHLY_PRICE"
    | "DIFFERENT_MONTHLY_PRICE"
    | "PRICE_DEFINITION_UNCLEAR"
    | "UNSAFE_PRICE";
}

export interface ExistingMonthlyPrice {
  priceYearMonth: string;
  price: number;
  granularity?: string;
  sourceType?: string;
}

export interface PriceHistoryChangeSet {
  inserts: HistoricalPrice[];
  updates: HistoricalPrice[];
  skippedCount: number;
  comparisons: MonthlyPriceComparison[];
}

export interface PriceHistoryRepository {
  recordStatus(productId: string, result: CollectionStatus): Promise<void>;
  saveMonthlyPrices(
    productId: string,
    source: PriceSource,
    prices: HistoricalPrice[]
  ): Promise<PriceHistoryWriteResult>;
  countValidDanawaHistoricalPrices(): Promise<number>;
}

export function buildPriceHistoryChangeSet(
  existing: ExistingMonthlyPrice[],
  incoming: HistoricalPrice[]
): PriceHistoryChangeSet {
  const existingByMonth = new Map(
    existing.map(row => [row.priceYearMonth, row])
  );
  const changeSet: PriceHistoryChangeSet = {
    inserts: [],
    updates: [],
    skippedCount: 0,
    comparisons: [],
  };

  for (const price of incoming) {
    const existingRow = existingByMonth.get(price.priceYearMonth);
    if (existingRow === undefined) {
      changeSet.inserts.push(price);
    } else {
      // Corrections need a separate reviewed operation, never an implicit overwrite.
      changeSet.skippedCount += 1;
      const comparable =
        existingRow.granularity === "MONTH" &&
        existingRow.sourceType === "HISTORICAL_IMPORT" &&
        price.granularity === "MONTH" &&
        price.sourceType === "HISTORICAL_IMPORT";
      const safe = [existingRow.price, price.price].every(
        value => Number.isSafeInteger(value) && value > 0
      );
      const same = existingRow.price === price.price;
      changeSet.comparisons.push({
        priceYearMonth: price.priceYearMonth,
        existingPrice: existingRow.price,
        incomingPrice: price.price,
        outcome:
          !comparable || !safe
            ? "INCOMPARABLE"
            : same
              ? "DUPLICATE"
              : "CONFLICT",
        reason: !comparable
          ? "PRICE_DEFINITION_UNCLEAR"
          : !safe
            ? "UNSAFE_PRICE"
            : same
              ? "SAME_MONTHLY_PRICE"
              : "DIFFERENT_MONTHLY_PRICE",
      });
    }
    existingByMonth.set(price.priceYearMonth, existingRow ?? price);
  }

  return changeSet;
}

export class PgPriceHistoryRepository implements PriceHistoryRepository {
  constructor(private readonly pool: Pool) {}

  async recordStatus(productId: string, result: CollectionStatus) {
    await saveCollectionStatus(this.pool, productId, "HISTORY", result);
  }

  async countValidDanawaHistoricalPrices(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM price_histories
        WHERE source = 'DANAWA'
          AND source_type = 'HISTORICAL_IMPORT'
          AND granularity = 'MONTH'
          AND price > 0`
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async saveMonthlyPrices(
    productId: string,
    source: PriceSource,
    prices: HistoricalPrice[]
  ): Promise<PriceHistoryWriteResult> {
    if (prices.length === 0) {
      return {
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        comparisons: [],
      };
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
        [productId, source]
      );

      const months = prices.map(price => `${price.priceYearMonth}-01`);
      const existingResult = await client.query<{
        price_year_month: string;
        price: string;
        granularity: string;
        source_type: string;
      }>(
        `SELECT to_char(price_year_month, 'YYYY-MM') AS price_year_month,
                price::text AS price, granularity, source_type
           FROM price_histories
          WHERE product_id = $1
            AND source = $2
            AND granularity = 'MONTH'
            AND price_year_month = ANY($3::date[])
          FOR UPDATE`,
        [productId, source, months]
      );

      const existing = existingResult.rows.map(row => ({
        priceYearMonth: row.price_year_month,
        price: Number(row.price),
        granularity: row.granularity,
        sourceType: row.source_type,
      }));
      const changeSet = buildPriceHistoryChangeSet(existing, prices);

      for (const price of changeSet.inserts) {
        await client.query(
          `INSERT INTO price_histories
             (product_id, source, price, price_year_month, granularity, source_type)
           VALUES ($1, $2, $3, $4::date, $5, $6)`,
          [
            productId,
            source,
            price.price,
            `${price.priceYearMonth}-01`,
            price.granularity,
            price.sourceType,
          ]
        );
      }

      await client.query("COMMIT");
      return {
        insertedCount: changeSet.inserts.length,
        updatedCount: changeSet.updates.length,
        skippedCount: changeSet.skippedCount,
        comparisons: changeSet.comparisons,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
