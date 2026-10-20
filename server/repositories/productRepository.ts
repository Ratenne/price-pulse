import type { Pool } from "pg";
import type { DiscoveredProduct } from "../domain/discoveredProduct";

export interface ProductUpsertResult {
  productId: string;
  inserted: boolean;
}

export interface ProductRepository {
  upsertDanawaProduct(product: DiscoveredProduct): Promise<ProductUpsertResult>;
}

export class PgProductRepository implements ProductRepository {
  constructor(private readonly pool: Pool) {}

  async upsertDanawaProduct(
    product: DiscoveredProduct
  ): Promise<ProductUpsertResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('DANAWA'), hashtext($1))",
        [product.externalProductId]
      );
      const existing = await client.query<{ product_id: string }>(
        `SELECT product_id
           FROM product_source_mappings
          WHERE source = 'DANAWA' AND external_product_id = $1`,
        [product.externalProductId]
      );
      const productId =
        existing.rows[0]?.product_id ?? `danawa-${product.externalProductId}`;
      const inserted = existing.rowCount === 0;

      await client.query(
        `INSERT INTO products
           (id, name, category, current_price, registered_year_month)
         VALUES ($1, $2, $3, $4, $5::date)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           registered_year_month = EXCLUDED.registered_year_month,
           updated_at = now()`,
        [
          productId,
          product.name,
          product.category,
          product.currentMinPrice ?? null,
          product.registeredYearMonth
            ? `${product.registeredYearMonth}-01`
            : null,
        ]
      );
      await client.query(
        `INSERT INTO product_source_mappings
           (product_id, source, external_product_id, source_url)
         VALUES ($1, 'DANAWA', $2, $3)
         ON CONFLICT (source, external_product_id) DO UPDATE SET
           source_url = EXCLUDED.source_url,
           updated_at = now()`,
        [productId, product.externalProductId, product.sourceUrl]
      );
      await client.query("COMMIT");
      return { productId, inserted };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
