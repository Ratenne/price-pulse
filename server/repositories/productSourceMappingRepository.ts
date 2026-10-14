import type { Pool } from "pg";
import type { PriceSource } from "../domain/historicalPrice";

export interface ProductSourceMappingRepository {
  findExternalProductId(
    productId: string,
    source: PriceSource
  ): Promise<string | undefined>;
  save(
    productId: string,
    source: PriceSource,
    externalProductId: string
  ): Promise<void>;
}

export class PgProductSourceMappingRepository
  implements ProductSourceMappingRepository
{
  constructor(private readonly pool: Pool) {}

  async findExternalProductId(
    productId: string,
    source: PriceSource
  ): Promise<string | undefined> {
    const result = await this.pool.query<{ external_product_id: string }>(
      `SELECT external_product_id
         FROM product_source_mappings
        WHERE product_id = $1 AND source = $2`,
      [productId, source]
    );
    return result.rows[0]?.external_product_id;
  }

  async save(
    productId: string,
    source: PriceSource,
    externalProductId: string
  ): Promise<void> {
    const normalizedExternalId = externalProductId.trim();
    if (!normalizedExternalId) {
      throw new Error("externalProductId must not be blank");
    }

    await this.pool.query(
      `INSERT INTO product_source_mappings (product_id, source, external_product_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, source)
       DO UPDATE SET external_product_id = EXCLUDED.external_product_id, updated_at = now()`,
      [productId, source, normalizedExternalId]
    );
  }
}
