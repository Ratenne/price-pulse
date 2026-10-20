import type { Pool } from "pg";
import type { HistoricalPrice, PriceSource } from "../domain/historicalPrice";
import type { CollectionStatus } from "../domain/priceCollection";
import { saveCollectionStatus } from "./priceCollectionStatus";

export interface PriceHistoryWriteResult {
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
}

export interface ExistingMonthlyPrice {
  priceYearMonth: string;
  price: number;
}

export interface PriceHistoryChangeSet {
  inserts: HistoricalPrice[];
  updates: HistoricalPrice[];
  skippedCount: number;
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
    existing.map(row => [row.priceYearMonth, row.price])
  );
  const changeSet: PriceHistoryChangeSet = {
    inserts: [],
    updates: [],
    skippedCount: 0,
  };

  for (const price of incoming) {
    const existingPrice = existingByMonth.get(price.priceYearMonth);
    if (existingPrice === undefined) {
      changeSet.inserts.push(price);
    } else {
      // Corrections need a separate reviewed operation, never an implicit overwrite.
      changeSet.skippedCount += 1;
    }
    existingByMonth.set(price.priceYearMonth, existingPrice ?? price.price);
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
      return { insertedCount: 0, updatedCount: 0, skippedCount: 0 };
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
      }>(
        `SELECT to_char(price_year_month, 'YYYY-MM') AS price_year_month,
                price::text AS price
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
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
