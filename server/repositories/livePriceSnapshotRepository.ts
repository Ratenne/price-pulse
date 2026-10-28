import type { Pool, PoolClient } from "pg";
import { saveCollectionStatus } from "./priceCollectionStatus";
import type { ObservedPriceDetails } from "../domain/priceCollection";
import type { Logger } from "../logging/logger";
import { LivePriceStorageDiagnostics } from "./livePriceStorageDiagnostics";

export interface MissingHistoryProduct {
  product_id: string;
  external_product_id: string;
  name: string;
}
export interface PriceSaveOutcome {
  externalId: string;
  productId?: string;
  status: "COMMITTED" | "SKIPPED";
  reason?:
    | "MAPPING_NOT_FOUND"
    | "MAPPING_CHANGED"
    | "SAME_OBSERVATION"
    | "OLDER_OBSERVATION";
  eventType?: "FIRST_OBSERVATION" | "OBSERVATION_BASELINE" | "PRICE_CHANGE";
  firstObservation?: boolean;
  basePriceChanged?: boolean | null;
  shippingKnowledgeChanged?: boolean;
}
export interface PriceSaveResult {
  updated: number;
  outcomes: PriceSaveOutcome[];
  skipped?: { externalId: string; productId?: string; reason: string }[];
}
export class LivePriceStorageError extends Error {
  readonly executionStatus = "FAILED" as const;
  constructor(
    message: string,
    public readonly externalId: string,
    public readonly productId: string | undefined,
    public readonly stage: string,
    public readonly failureType:
      | "STORAGE_ERROR"
      | "INVALID_OBSERVATION"
      | "OBSERVATION_CONFLICT"
      | "AMBIGUOUS_MAPPING",
    public readonly committedOutcomes: PriceSaveOutcome[],
    cause: unknown,
    public readonly rollbackFailed = false
  ) {
    super(message, { cause });
    this.name = "LivePriceStorageError";
  }
}
export interface LivePriceSnapshotRepository {
  countMappedProducts(): Promise<number>;
  findProductsWithoutHistory(): Promise<MissingHistoryProduct[]>;
  findTrackedProducts(): Promise<MissingHistoryProduct[]>;
  applyPrices(
    prices: Map<string, number>,
    checkedAt: string,
    details?: Map<string, ObservedPriceDetails>,
    expectedMappings?: Map<string, string>,
    diagnostics?: { logger: Logger; batch: string }
  ): Promise<PriceSaveResult>;
  recordUnobserved(
    presentExternalIds: string[],
    checkedAt: string,
    reason: string,
    targetExternalIds?: string[],
    expectedMappings?: MissingHistoryProduct[]
  ): Promise<{ failed: number; matchedExternalIds?: string[] }>;
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

  async findTrackedProducts(): Promise<MissingHistoryProduct[]> {
    return (
      await this.pool.query<MissingHistoryProduct>(
        `SELECT m.product_id, m.external_product_id, p.name FROM product_source_mappings m LEFT JOIN products p ON p.id=m.product_id WHERE m.source='DANAWA' ORDER BY m.product_id, m.external_product_id`
      )
    ).rows;
  }

  async applyPrices(
    prices: Map<string, number>,
    checkedAt: string,
    details?: Map<string, ObservedPriceDetails>,
    expectedMappings?: Map<string, string>,
    diagnostics?: { logger: Logger; batch: string }
  ) {
    let updated = 0;
    const outcomes: PriceSaveOutcome[] = [];
    const skipped: {
      externalId: string;
      productId?: string;
      reason: string;
    }[] = [];
    const monitor = diagnostics
      ? new LivePriceStorageDiagnostics(
          diagnostics.logger,
          diagnostics.batch,
          prices.size
        )
      : undefined;
    try {
      // Each product commits independently, so retries after partial failure are safe.
      for (const [externalId, price] of Array.from(prices)) {
        monitor?.startProduct(externalId);
        const previousOutcomes = outcomes.length;
        const observedAt = details?.get(externalId)?.observedAt ?? checkedAt;
        const shippingFee = details?.get(externalId)?.shippingFee ?? null;
        let client: PoolClient | undefined;
        let productId: string | undefined;
        let stage = "VALIDATE";
        const setStage = (next: string) => {
          stage = next;
          monitor?.startStage(next);
        };
        let inTransaction = false;
        try {
          if (
            !Number.isSafeInteger(price) ||
            price <= 0 ||
            (shippingFee !== null &&
              (!Number.isSafeInteger(shippingFee) || shippingFee < 0)) ||
            !Number.isFinite(Date.parse(observedAt))
          )
            throw new Error("INVALID_OBSERVATION");
          setStage("CONNECT");
          client = await this.pool.connect();
          setStage("BEGIN");
          inTransaction = true;
          await client.query("BEGIN");
          // Match discovery's external-code lock before taking mapping row locks.
          // Otherwise discovery (product -> mapping) and observation (mapping ->
          // product) could deadlock when the schedules overlap.
          setStage("LOCK_EXTERNAL");
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtext('DANAWA'), hashtext($1))",
            [externalId]
          );
          setStage("READ_MAPPING");
          const mapped = await client.query<{ product_id: string }>(
            `SELECT product_id FROM product_source_mappings WHERE source='DANAWA' AND external_product_id=$1 FOR SHARE`,
            [externalId]
          );
          if (mapped.rows.length > 1)
            throw new Error("AMBIGUOUS_DANAWA_MAPPING");
          productId = mapped.rows[0]?.product_id;
          monitor?.setProductId(productId);
          if (!productId) {
            skipped.push({ externalId, reason: "MAPPING_NOT_FOUND" });
            setStage("COMMIT");
            await client.query("COMMIT");
            inTransaction = false;
            outcomes.push({
              externalId,
              status: "SKIPPED",
              reason: "MAPPING_NOT_FOUND",
            });
            continue;
          }
          if (
            expectedMappings?.has(externalId) &&
            expectedMappings.get(externalId) !== productId
          ) {
            skipped.push({ externalId, productId, reason: "MAPPING_CHANGED" });
            setStage("COMMIT");
            await client.query("COMMIT");
            inTransaction = false;
            outcomes.push({
              externalId,
              productId,
              status: "SKIPPED",
              reason: "MAPPING_CHANGED",
            });
            continue;
          }
          // Shared with monthly backfill: first-history decisions are serialized.
          setStage("LOCK_PRODUCT");
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
            [productId, "DANAWA"]
          );
          setStage("READ_OBSERVATION");
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
          if (
            previous &&
            time <= new Date(previous.last_observed_at).getTime()
          ) {
            if (
              time === new Date(previous.last_observed_at).getTime() &&
              (Number(previous.item_price) !== price ||
                (previous.shipping_fee === null
                  ? null
                  : Number(previous.shipping_fee)) !== shippingFee)
            )
              throw new Error("OBSERVATION_CONFLICT");
            setStage("COMMIT");
            await client.query("COMMIT");
            inTransaction = false;
            const reason =
              time === new Date(previous.last_observed_at).getTime()
                ? "SAME_OBSERVATION"
                : "OLDER_OBSERVATION";
            skipped.push({
              externalId,
              productId,
              reason,
            });
            outcomes.push({ externalId, productId, status: "SKIPPED", reason });
            continue;
          }
          const priorShipping =
            previous?.shipping_fee == null
              ? null
              : Number(previous.shipping_fee);
          const changed =
            previous &&
            (Number(previous.item_price) !== price ||
              (priorShipping !== null &&
                shippingFee !== null &&
                priorShipping !== shippingFee));
          const shippingKnowledgeChanged =
            previous && (priorShipping === null) !== (shippingFee === null);
          let eventType: PriceSaveOutcome["eventType"];
          if (!previous || changed || shippingKnowledgeChanged) {
            eventType = changed ? "PRICE_CHANGE" : "OBSERVATION_BASELINE";
            if (!previous) {
              setStage("READ_HISTORY");
              const history = await client.query(
                `SELECT 1 FROM price_histories_for_analysis WHERE product_id=$1 AND price>0 LIMIT 1`,
                [productId]
              );
              if (!history.rowCount) eventType = "FIRST_OBSERVATION";
            }
            setStage("INSERT_OBSERVATION");
            await client.query(
              `INSERT INTO price_observations(product_id,source,observed_at,item_price,shipping_fee,event_type,last_observed_at)
             VALUES($1,'DANAWA',$2,$3,$4,$5,$2)`,
              [productId, observedAt, price, shippingFee, eventType]
            );
          } else {
            setStage("UPDATE_OBSERVATION");
            await client.query(
              `UPDATE price_observations SET last_observed_at=$2,observation_count=observation_count+1
             WHERE product_id=$1 AND source='DANAWA' AND observed_at=$3`,
              [productId, observedAt, previous.observed_at]
            );
          }
          setStage("UPDATE_CURRENT_PRICE");
          await client.query(
            `UPDATE products SET current_price=$2,current_price_checked_at=$3
           WHERE id=$1 AND (current_price_checked_at IS NULL OR current_price_checked_at <= $3::timestamptz)`,
            [productId, price, observedAt]
          );
          setStage("SAVE_STATUS");
          await saveCollectionStatus(client, productId, "CURRENT", {
            status: "NORMAL",
            reason: "PRICE_RECONFIRMED",
            checkedAt: observedAt,
          });
          setStage("COMMIT");
          await client.query("COMMIT");
          inTransaction = false;
          updated++;
          outcomes.push({
            externalId,
            productId,
            status: "COMMITTED",
            eventType,
            firstObservation: !previous,
            basePriceChanged: previous
              ? Number(previous.item_price) !== price
              : null,
            shippingKnowledgeChanged: Boolean(shippingKnowledgeChanged),
          });
        } catch (error) {
          monitor?.finishStage();
          let rollbackFailed = false;
          if (client && inTransaction) {
            monitor?.startStage("ROLLBACK");
            try {
              await client.query("ROLLBACK");
            } catch {
              rollbackFailed = true;
            } finally {
              monitor?.finishStage();
            }
          }
          const message =
            error instanceof Error ? error.message : String(error);
          const failureType =
            message === "INVALID_OBSERVATION"
              ? "INVALID_OBSERVATION"
              : message === "OBSERVATION_CONFLICT"
                ? "OBSERVATION_CONFLICT"
                : message === "AMBIGUOUS_DANAWA_MAPPING"
                  ? "AMBIGUOUS_MAPPING"
                  : "STORAGE_ERROR";
          throw new LivePriceStorageError(
            message,
            externalId,
            productId,
            stage,
            failureType,
            outcomes.filter(o => o.status === "COMMITTED"),
            error,
            rollbackFailed
          );
        } finally {
          monitor?.finishStage();
          monitor?.finishProduct();
          if (outcomes.length > previousOutcomes)
            monitor?.completed(outcomes[outcomes.length - 1]);
          client?.release();
        }
      }
      return skipped.length
        ? { updated, outcomes, skipped }
        : { updated, outcomes };
    } finally {
      monitor?.close();
    }
  }

  // A missing listing is not proof of absent source history. Preserve both the
  // previous price and the time of its last successful confirmation.
  async recordUnobserved(
    presentExternalIds: string[],
    checkedAt: string,
    reason: string,
    targetExternalIds?: string[],
    expectedMappings?: MissingHistoryProduct[]
  ) {
    const result = await this.pool.query<{
      failed: string;
      matched_external_ids: string[];
    }>(
      `WITH candidates AS (
       SELECT m.product_id, m.external_product_id FROM product_source_mappings m WHERE m.source='DANAWA'
         AND m.external_product_id <> ALL($1::text[])
         AND ($4::text[] IS NULL OR m.external_product_id=ANY($4::text[]))
         AND ($5::jsonb IS NULL OR EXISTS (SELECT 1 FROM jsonb_to_recordset($5::jsonb) AS e(product_id text, external_product_id text) WHERE e.product_id=m.product_id AND e.external_product_id=m.external_product_id))
       ), recorded AS (
       INSERT INTO price_collection_status(product_id,source,stream,status,reason,checked_at)
       SELECT product_id,'DANAWA','CURRENT','COLLECTION_FAILED',$3,$2::timestamptz FROM candidates
       ON CONFLICT(product_id,source,stream,checked_at) DO NOTHING
       ) SELECT count(*)::text AS failed, coalesce(array_agg(external_product_id), ARRAY[]::text[]) AS matched_external_ids FROM candidates`,
      [
        presentExternalIds,
        checkedAt,
        reason,
        targetExternalIds ?? null,
        expectedMappings ? JSON.stringify(expectedMappings) : null,
      ]
    );
    return expectedMappings
      ? {
          failed: Number(result.rows[0].failed),
          matchedExternalIds: result.rows[0].matched_external_ids,
        }
      : { failed: Number(result.rows[0].failed) };
  }
}
