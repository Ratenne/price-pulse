import type { Pool } from "pg";

export interface LivePriceSnapshotRepository {
  countMappedProducts(): Promise<number>;
  applyPrices(
    prices: Map<string, number>,
    checkedAt: string
  ): Promise<{ updated: number }>;
  clearMissing(
    presentExternalIds: string[],
    checkedAt: string
  ): Promise<{ cleared: number }>;
}

const DANAWA_PRODUCT_URL = "https://prod.danawa.com/info/%";

export class PgLivePriceSnapshotRepository
  implements LivePriceSnapshotRepository
{
  constructor(private readonly pool: Pool) {}

  async countMappedProducts(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM product_source_mappings
        WHERE source = 'DANAWA' AND source_url LIKE $1`,
      [DANAWA_PRODUCT_URL]
    );
    return Number(result.rows[0].count);
  }

  // One statement for the whole list instead of one UPDATE per product.
  async applyPrices(prices: Map<string, number>, checkedAt: string) {
    if (!prices.size) return { updated: 0 };
    const result = await this.pool.query(
      `UPDATE products p
          SET current_price = v.price,
              current_price_checked_at = $3::timestamptz
         FROM unnest($1::text[], $2::bigint[]) AS v(external_product_id, price)
         JOIN product_source_mappings m
           ON m.source = 'DANAWA' AND m.external_product_id = v.external_product_id
        WHERE p.id = m.product_id AND v.price > 0`,
      [Array.from(prices.keys()), Array.from(prices.values()), checkedAt]
    );
    return { updated: result.rowCount ?? 0 };
  }

  // A listing Danawa no longer returns must not keep showing its last price.
  async clearMissing(presentExternalIds: string[], checkedAt: string) {
    const result = await this.pool.query(
      `UPDATE products p
          SET current_price = NULL,
              current_price_checked_at = $2::timestamptz
         FROM product_source_mappings m
        WHERE m.product_id = p.id AND m.source = 'DANAWA'
          AND m.source_url LIKE $3
          AND m.external_product_id <> ALL($1::text[])`,
      [presentExternalIds, checkedAt, DANAWA_PRODUCT_URL]
    );
    return { cleared: result.rowCount ?? 0 };
  }
}
