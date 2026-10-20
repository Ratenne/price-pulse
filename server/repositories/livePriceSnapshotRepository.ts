import type { Pool } from "pg";
import { saveCollectionStatus } from "./priceCollectionStatus";
import type { ObservedPriceDetails } from "../domain/priceCollection";

export interface MissingHistoryProduct {
  product_id: string;
  external_product_id: string;
  name: string;
}
export interface LivePriceSnapshotRepository {
  countMappedProducts(): Promise<number>;
  findProductsWithoutHistory(): Promise<MissingHistoryProduct[]>;
  applyPrices(
    prices: Map<string, number>,
    checkedAt: string,
    details?: Map<string, ObservedPriceDetails>
  ): Promise<{ updated: number }>;
  recordUnobserved(
    presentExternalIds: string[],
    checkedAt: string,
    reason: string,
    targetExternalIds?: string[]
  ): Promise<{ failed: number }>;
}

export class PgLivePriceSnapshotRepository
  implements LivePriceSnapshotRepository
{
  constructor(private readonly pool: Pool) {}

  async countMappedProducts(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM product_source_mappings WHERE source = 'DANAWA'`
    );
    return Number(result.rows[0].count);
  }

  async findProductsWithoutHistory(): Promise<MissingHistoryProduct[]> {
    return (
      await this.pool.query<MissingHistoryProduct>(
        `SELECT product_id, external_product_id, name FROM products_without_price_history ORDER BY product_id`
      )
    ).rows;
  }

  async applyPrices(
    prices: Map<string, number>,
    checkedAt: string,
    details?: Map<string, ObservedPriceDetails>
  ) {
    let updated = 0;
    // Each product commits independently, so retries after partial failure are safe.
    for (const [externalId, price] of Array.from(prices)) {
      const observedAt = details?.get(externalId)?.observedAt ?? checkedAt;
      const shippingFee = details?.get(externalId)?.shippingFee ?? null;
      if (
        !Number.isSafeInteger(price) ||
        price <= 0 ||
        (shippingFee !== null &&
          (!Number.isSafeInteger(shippingFee) || shippingFee < 0)) ||
        !Number.isFinite(Date.parse(observedAt))
      )
        throw new Error("INVALID_OBSERVATION");
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        // Match discovery's external-code lock before taking mapping row locks.
        // Otherwise discovery (product -> mapping) and observation (mapping ->
        // product) could deadlock when the schedules overlap.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('DANAWA'), hashtext($1))",
          [externalId]
        );
        const mapped = await client.query<{ product_id: string }>(
          `SELECT product_id FROM product_source_mappings WHERE source='DANAWA' AND external_product_id=$1 FOR SHARE`,
          [externalId]
        );
        const productId = mapped.rows[0]?.product_id;
        if (!productId) {
          await client.query("COMMIT");
          continue;
        }
        // Shared with monthly backfill: first-history decisions are serialized.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
          [productId, "DANAWA"]
        );
        const latest = await client.query<{
          item_price: string;
          shipping_fee: string | null;
          last_observed_at: Date;
          observed_at: Date;
        }>(
          `SELECT item_price,shipping_fee,last_observed_at,observed_at FROM price_observations
            WHERE product_id=$1 AND source='DANAWA' ORDER BY observed_at DESC LIMIT 1 FOR UPDATE`,
          [productId]
        );
        const previous = latest.rows[0];
        const time = Date.parse(observedAt);
        if (previous && time <= new Date(previous.last_observed_at).getTime()) {
          if (
            time === new Date(previous.last_observed_at).getTime() &&
            (Number(previous.item_price) !== price ||
              (previous.shipping_fee === null
                ? null
                : Number(previous.shipping_fee)) !== shippingFee)
          )
            throw new Error("OBSERVATION_CONFLICT");
          await client.query("COMMIT");
          continue;
        }
        const priorShipping =
          previous?.shipping_fee == null ? null : Number(previous.shipping_fee);
        const changed =
          previous &&
          (Number(previous.item_price) !== price ||
            (priorShipping !== null &&
              shippingFee !== null &&
              priorShipping !== shippingFee));
        const shippingKnowledgeChanged =
          previous && (priorShipping === null) !== (shippingFee === null);
        if (!previous || changed || shippingKnowledgeChanged) {
          let eventType = changed ? "PRICE_CHANGE" : "OBSERVATION_BASELINE";
          if (!previous) {
            const history = await client.query(
              `SELECT 1 FROM price_histories_for_analysis WHERE product_id=$1 AND price>0 LIMIT 1`,
              [productId]
            );
            if (!history.rowCount) eventType = "FIRST_OBSERVATION";
          }
          await client.query(
            `INSERT INTO price_observations(product_id,source,observed_at,item_price,shipping_fee,event_type,last_observed_at)
             VALUES($1,'DANAWA',$2,$3,$4,$5,$2)`,
            [productId, observedAt, price, shippingFee, eventType]
          );
        } else {
          await client.query(
            `UPDATE price_observations SET last_observed_at=$2,observation_count=observation_count+1
             WHERE product_id=$1 AND source='DANAWA' AND observed_at=$3`,
            [productId, observedAt, previous.observed_at]
          );
        }
        await client.query(
          `UPDATE products SET current_price=$2,current_price_checked_at=$3
           WHERE id=$1 AND (current_price_checked_at IS NULL OR current_price_checked_at <= $3::timestamptz)`,
          [productId, price, observedAt]
        );
        await saveCollectionStatus(client, productId, "CURRENT", {
          status: "NORMAL",
          reason: "PRICE_RECONFIRMED",
          checkedAt: observedAt,
        });
        await client.query("COMMIT");
        updated++;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    return { updated };
  }

  // A missing listing is not proof of absent source history. Preserve both the
  // previous price and the time of its last successful confirmation.
  async recordUnobserved(
    presentExternalIds: string[],
    checkedAt: string,
    reason: string,
    targetExternalIds?: string[]
  ) {
    const result = await this.pool.query<{ failed: string }>(
      `WITH candidates AS (
       SELECT product_id FROM product_source_mappings WHERE source='DANAWA'
         AND external_product_id <> ALL($1::text[])
         AND ($4::text[] IS NULL OR external_product_id=ANY($4::text[]))
       ), recorded AS (
       INSERT INTO price_collection_status(product_id,source,stream,status,reason,checked_at)
       SELECT product_id,'DANAWA','CURRENT','COLLECTION_FAILED',$3,$2::timestamptz FROM candidates
       ON CONFLICT(product_id,source,stream,checked_at) DO NOTHING
       ) SELECT count(*)::text AS failed FROM candidates`,
      [presentExternalIds, checkedAt, reason, targetExternalIds ?? null]
    );
    return { failed: Number(result.rows[0].failed) };
  }
}
