import type { Pool, PoolClient } from "pg";
import type {
  RetailLink,
  RetailObservation,
  RetailStoredObservation,
} from "../integrations/retail/retailPrice.js";
import { linkSchema } from "../integrations/retail/retailPrice.js";

export interface RetailPriceRepository {
  due(limit: number): Promise<RetailLink[]>;
  save(
    link: RetailLink,
    offer: RetailObservation,
    method: "CRAWL" | "IMPORT"
  ): Promise<boolean>;
  failed(link: RetailLink, code: string): Promise<void>;
}
const LINK_COLUMNS = `l.id,l.version,l.product_id AS "productId",l.product_name AS "productName",l.source,l.url,l.listing_name AS "listingName"`;
export class PgRetailPriceRepository implements RetailPriceRepository {
  constructor(private readonly pool: Pool) {}
  async register(inputs: unknown[]) {
    const links = inputs.map(input => linkSchema.parse(input));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const l of links) {
        const result = await client.query(
          `INSERT INTO retail_product_links AS l(product_id,product_name,source,url,listing_name)
           SELECT p.id,p.name,$3,$4,$5 FROM products p WHERE p.id=$1 AND p.name=$2 AND p.category IN ('GPU','PC 주요 부품_그래픽카드')
           ON CONFLICT(source,url) DO UPDATE SET listing_name=excluded.listing_name,product_name=excluded.product_name,
             version=l.version+CASE WHEN (l.listing_name,l.product_name) IS DISTINCT FROM (excluded.listing_name,excluded.product_name) THEN 1 ELSE 0 END,
             verified_at=CASE WHEN (l.listing_name,l.product_name) IS DISTINCT FROM (excluded.listing_name,excluded.product_name) THEN now() ELSE l.verified_at END
           WHERE l.product_id=excluded.product_id RETURNING id`,
          [l.productId, l.productName, l.source, l.url, l.listingName]
        );
        if (!result.rowCount)
          throw new Error("PRODUCT_NOT_FOUND_OR_MAPPING_CONFLICT");
      }
      await client.query("COMMIT");
      return links.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async due(limit: number): Promise<RetailLink[]> {
    const result = await this.pool.query<RetailLink>(
      `SELECT ${LINK_COLUMNS} FROM retail_product_links l JOIN products p ON p.id=l.product_id AND p.name=l.product_name
       WHERE l.enabled AND (l.last_attempt_at IS NULL OR l.last_attempt_at<now()-interval '3 hours')
       ORDER BY row_number() OVER(PARTITION BY l.source ORDER BY l.last_attempt_at NULLS FIRST,l.id),l.source LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
  async find(id: number): Promise<RetailLink | undefined> {
    return (
      await this.pool.query<RetailLink>(
        `SELECT ${LINK_COLUMNS} FROM retail_product_links l WHERE l.id=$1 AND l.enabled`,
        [id]
      )
    ).rows[0];
  }
  async save(
    link: RetailLink,
    offer: RetailObservation,
    method: "CRAWL" | "IMPORT"
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await this.saveOnClient(client, link, offer, method);
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Shared writer: the product ingester supplies its transaction so product,
  // identity, mapping and prices either all commit or all roll back.
  async saveOnClient(
    client: PoolClient,
    link: RetailLink,
    offer: RetailStoredObservation,
    method: "CRAWL" | "IMPORT" | "API",
    dataSource?: string
  ) {
    const locked = await client.query(
      `SELECT l.id FROM retail_product_links l JOIN products p ON p.id=l.product_id AND p.name=l.product_name
       WHERE l.id=$1 AND l.version=$2 AND l.enabled FOR UPDATE OF l`,
      [link.id, link.version]
    );
    if (!locked.rowCount) throw new Error("MAPPING_CHANGED");
    const duplicate = await client.query<{
      item_price: string | null;
      shipping_fee: string | null;
      link_version: number;
      availability: string;
    }>(
      `SELECT item_price,shipping_fee,link_version,availability FROM retail_price_observations WHERE listing_id=$1 AND observed_at=$2`,
      [link.id, offer.observedAt]
    );
    const prior = duplicate.rows[0];
    if (
      prior &&
      ((prior.item_price === null ? null : Number(prior.item_price)) !==
        offer.itemPrice ||
        (prior.shipping_fee === null ? null : Number(prior.shipping_fee)) !==
          offer.shippingFee ||
        prior.link_version !== link.version ||
        prior.availability !== offer.availability)
    )
      throw new Error("OBSERVATION_CONFLICT");
    await client.query(
      `INSERT INTO retail_price_observations(listing_id,observed_at,item_price,shipping_fee,method,link_version,availability,data_source,title)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(listing_id,observed_at) DO NOTHING`,
      [
        link.id,
        offer.observedAt,
        offer.itemPrice,
        offer.shippingFee,
        method,
        link.version,
        offer.availability,
        dataSource ?? null,
        offer.title,
      ]
    );
    const saved = await client.query(
      `INSERT INTO retail_current_offers AS c(listing_id,observed_at,item_price,shipping_fee,link_version,availability)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(listing_id) DO UPDATE SET
       observed_at=excluded.observed_at,item_price=excluded.item_price,shipping_fee=excluded.shipping_fee,
       link_version=excluded.link_version,availability=excluded.availability
       WHERE c.observed_at<excluded.observed_at`,
      [
        link.id,
        offer.observedAt,
        offer.itemPrice,
        offer.shippingFee,
        link.version,
        offer.availability,
      ]
    );
    await client.query(
      "UPDATE retail_product_links SET last_attempt_at=now(),last_error=NULL WHERE id=$1",
      [link.id]
    );
    return (saved.rowCount ?? 0) > 0;
  }
  async failed(link: RetailLink, code: string) {
    await this.pool.query(
      `WITH attempted AS (UPDATE retail_product_links SET last_attempt_at=now(),last_error=$2 WHERE id=$1 AND version=$3 RETURNING id)
       DELETE FROM retail_current_offers WHERE listing_id IN (SELECT id FROM attempted) AND $2='UNAVAILABLE_OFFER'`,
      [link.id, code, link.version]
    );
  }
}
