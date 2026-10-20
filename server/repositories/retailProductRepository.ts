import type { Pool, PoolClient } from "pg";
import { PgRetailPriceRepository } from "./retailPriceRepository.js";
import {
  validateStoredRetailObservation,
  type RetailLink,
} from "../integrations/retail/retailPrice.js";
import {
  canonicalRetailCategory,
  inputIdentity,
  normalizeRetailIdentity,
  retailIdentityKey,
  reviewIdentityMatches,
  sameRetailIdentity,
  sameRetailIdentifierScope,
  type RetailIdentity,
  type RetailProductInput,
  type RetailProductReview,
} from "../domain/retailProduct.js";

export type RetailProductUpsertResult =
  | { status: "HELD"; reason: string; candidates: string[] }
  | {
      status: "CREATED" | "MATCHED";
      productId: string;
      listingId: number;
      updated: boolean;
    };
export interface RetailProductRepository {
  upsert(
    input: RetailProductInput,
    review?: RetailProductReview,
    now?: Date
  ): Promise<RetailProductUpsertResult>;
}
interface ProductIdentityRow {
  productId: string;
  productName: string;
  category: string;
  identity: RetailIdentity | null;
  requiredOptionKeys: string[] | null;
}
const IDENTITY_COLUMNS = `p.id AS "productId",p.name AS "productName",p.category,i.identity,i.required_option_keys AS "requiredOptionKeys"`;
const hasOptions = (keys: string[] | null, identity: RetailIdentity) =>
  !!keys?.length && keys.every(key => !!identity.variants[key]);

export class PgRetailProductRepository implements RetailProductRepository {
  private readonly prices: PgRetailPriceRepository;
  constructor(private readonly pool: Pool) {
    this.prices = new PgRetailPriceRepository(pool);
  }

  async upsert(
    input: RetailProductInput,
    review?: RetailProductReview,
    now = new Date()
  ): Promise<RetailProductUpsertResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // One lock per external listing, followed by one per canonical identity.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('RETAIL_LISTING'),hashtext($1))",
        [`${input.source}:${input.externalProductId}`]
      );
      const result = await this.process(client, input, review, now);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async hold(
    client: PoolClient,
    input: RetailProductInput,
    reason: string,
    candidates: string[] = []
  ): Promise<RetailProductUpsertResult> {
    const ids = Array.from(new Set(candidates)).sort();
    await client.query(
      `INSERT INTO retail_product_review_queue AS q(source,external_product_id,title,candidate_product_ids,reason)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(source,external_product_id) DO UPDATE SET
      title=excluded.title,candidate_product_ids=excluded.candidate_product_ids,reason=excluded.reason,last_seen_at=greatest(q.last_seen_at,now()),resolved_at=NULL`,
      [input.source, input.externalProductId, input.title, ids, reason]
    );
    return { status: "HELD", reason, candidates: ids };
  }

  private async process(
    client: PoolClient,
    input: RetailProductInput,
    review: RetailProductReview | undefined,
    now: Date
  ): Promise<RetailProductUpsertResult> {
    const mappings = await client.query<
      RetailLink & { externalProductId: string | null; enabled: boolean }
    >(
      `SELECT id,version,product_id AS "productId",product_name AS "productName",listing_name AS "listingName",source,url,
       external_product_id AS "externalProductId",enabled FROM retail_product_links
       WHERE source=$1 AND (external_product_id=$2 OR url=$3) ORDER BY id FOR UPDATE`,
      [input.source, input.externalProductId, input.url]
    );
    if (mappings.rows.length > 1)
      return this.hold(
        client,
        input,
        "MAPPING_CONFLICT",
        mappings.rows.map(l => l.productId)
      );
    const mapped = mappings.rows[0];
    if (
      mapped &&
      (!mapped.enabled ||
        (mapped.externalProductId &&
          mapped.externalProductId !== input.externalProductId))
    )
      return this.hold(client, input, "MAPPING_CONFLICT", [mapped.productId]);
    if (input.listingId !== undefined && input.listingId !== mapped?.id)
      return this.hold(
        client,
        input,
        "MAPPING_CONFLICT",
        mapped ? [mapped.productId] : []
      );
    const parsed = inputIdentity(input);
    if (!parsed.success)
      return this.hold(
        client,
        input,
        "INCOMPLETE_IDENTITY",
        mapped ? [mapped.productId] : []
      );
    const identity = normalizeRetailIdentity(parsed.data);
    const key = retailIdentityKey(identity);
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('RETAIL_IDENTITY'),hashtext($1))",
      [key]
    );
    if (
      review &&
      (review.source !== input.source ||
        review.externalProductId !== input.externalProductId ||
        !reviewIdentityMatches(review, identity, now))
    )
      return this.hold(
        client,
        input,
        "REVIEW_IDENTITY_MISMATCH",
        mapped ? [mapped.productId] : []
      );

    const candidates = await client.query<ProductIdentityRow>(
      `SELECT ${IDENTITY_COLUMNS} FROM products p LEFT JOIN retail_product_identities i ON i.product_id=p.id
       WHERE i.identity_key=$1 OR (i.identity->>'manufacturer'=$2 AND i.identity->>'mpn'=$3)
       OR i.identity->>'gtin'=$4 OR p.name=$5 OR p.id=$6 OR p.id=$7 ORDER BY p.id`,
      [
        key,
        identity.manufacturer,
        identity.mpn ?? null,
        identity.gtin ?? null,
        input.title,
        mapped?.productId ?? null,
        review?.productId ?? null,
      ]
    );
    if (
      candidates.rows.some(
        p =>
          p.identity &&
          (retailIdentityKey(p.identity) === key ||
            sameRetailIdentifierScope(p.identity, identity)) &&
          !sameRetailIdentity(p.identity, identity)
      )
    )
      return this.hold(
        client,
        input,
        "IDENTIFIER_CONFLICT",
        candidates.rows.map(p => p.productId)
      );
    const matches = candidates.rows.filter(
      p =>
        p.identity &&
        sameRetailIdentity(p.identity, identity) &&
        hasOptions(p.requiredOptionKeys, identity)
    );
    let product: ProductIdentityRow | undefined;
    let created = false;
    if (mapped) {
      product = candidates.rows.find(p => p.productId === mapped.productId);
      if (!product)
        return this.hold(client, input, "MAPPING_CONFLICT", [mapped.productId]);
      if (
        product.identity &&
        !matches.some(p => p.productId === product!.productId)
      )
        return this.hold(client, input, "MAPPED_IDENTITY_CHANGED", [
          product.productId,
        ]);
      if (
        !product.identity &&
        !(review?.action === "MATCH" && review.productId === product.productId)
      )
        return this.hold(client, input, "MAPPED_IDENTITY_UNVERIFIED", [
          product.productId,
        ]);
      if (matches.some(p => p.productId !== product!.productId))
        return this.hold(
          client,
          input,
          "MAPPING_CONFLICT",
          matches.map(p => p.productId)
        );
    } else if (matches.length === 1) product = matches[0];
    else if (matches.length > 1)
      return this.hold(
        client,
        input,
        "AMBIGUOUS_IDENTITY",
        matches.map(p => p.productId)
      );
    else if (review?.action === "MATCH") {
      product = candidates.rows.find(p => p.productId === review.productId);
      if (
        !product ||
        (product.identity && !sameRetailIdentity(product.identity, identity))
      )
        return this.hold(
          client,
          input,
          "REVIEW_TARGET_MISMATCH",
          candidates.rows.map(p => p.productId)
        );
    } else {
      if (!review || review.action !== "CREATE")
        return this.hold(
          client,
          input,
          "NEW_PRODUCT_NOT_VERIFIED",
          candidates.rows.map(p => p.productId)
        );
      if (candidates.rows.some(p => !p.identity))
        return this.hold(
          client,
          input,
          "UNREVIEWED_CATALOG_CANDIDATE",
          candidates.rows.map(p => p.productId)
        );
      if (!review.category || !review.productName)
        return this.hold(client, input, "CATEGORY_OR_NAME_UNVERIFIED");
      product = {
        productId: `retail-${key}`,
        productName: review.productName,
        category: review.category,
        identity: null,
        requiredOptionKeys: null,
      };
      created = true;
    }
    if (review?.action === "MATCH" && review.productId !== product.productId)
      return this.hold(client, input, "REVIEW_TARGET_MISMATCH", [
        product.productId,
      ]);
    const category = canonicalRetailCategory(product.category);
    if (!category || (review?.category && category !== review.category))
      return this.hold(client, input, "CATEGORY_OR_NAME_UNVERIFIED", [
        product.productId,
      ]);
    // Current retail scope is GPU; keep memory, OC and package distinctions explicit.
    const required = product.requiredOptionKeys ?? review?.requiredOptionKeys;
    if (
      !hasOptions(required ?? null, identity) ||
      (category === "GPU" &&
        !["memory", "overclock", "bundle"].every(k => !!identity.variants[k]))
    )
      return this.hold(client, input, "MISSING_REQUIRED_VARIANTS", [
        product.productId,
      ]);

    // Validate money/stock/time before touching any product, identity or mapping.
    let offer;
    const link: RetailLink = {
      id: mapped?.id ?? 1,
      version: mapped?.version ?? 1,
      productId: product.productId,
      productName: product.productName,
      listingName: input.title,
      source: input.source,
      url: input.url,
    };
    try {
      offer = validateStoredRetailObservation(
        link,
        {
          listingId: link.id,
          title: input.title,
          itemPrice: input.itemPrice ?? null,
          shippingFee: input.shippingFee ?? null,
          currency: input.currency,
          condition: input.condition,
          availability: input.availability,
          conditional: input.conditional,
          observedAt: input.observedAt,
        },
        now
      );
    } catch {
      return this.hold(
        client,
        input,
        "INVALID_PRICE_OBSERVATION",
        created ? [] : [product.productId]
      );
    }
    if (created)
      await client.query(
        "INSERT INTO products(id,name,category) VALUES($1,$2,$3)",
        [product.productId, product.productName, category]
      );
    else
      await client.query("SELECT id FROM products WHERE id=$1 FOR UPDATE", [
        product.productId,
      ]);
    if (!product.identity) {
      if (!review) throw new Error("MISSING_IDENTITY_REVIEW");
      await client.query(
        `INSERT INTO retail_product_identities(product_id,identity_key,identity,required_option_keys,reviewed_by,reviewed_at,evidence)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          product.productId,
          key,
          JSON.stringify(identity),
          required,
          review.reviewedBy,
          review.reviewedAt,
          review.evidence,
        ]
      );
    }
    const registered = mapped
      ? await client.query<{ id: number; version: number }>(
          `UPDATE retail_product_links SET product_name=$2,url=$3,listing_name=$4,external_product_id=$5
         WHERE id=$1 AND product_id=$6 RETURNING id,version`,
          [
            mapped.id,
            product.productName,
            input.url,
            input.title,
            input.externalProductId,
            product.productId,
          ]
        )
      : await client.query<{ id: number; version: number }>(
          `INSERT INTO retail_product_links AS l(product_id,product_name,source,url,listing_name,external_product_id)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id,version`,
          [
            product.productId,
            product.productName,
            input.source,
            input.url,
            input.title,
            input.externalProductId,
          ]
        );
    if (!registered.rowCount) throw new Error("MAPPING_CONFLICT");
    link.id = registered.rows[0].id;
    link.version = registered.rows[0].version;
    offer.listingId = link.id;
    const updated = await this.prices.saveOnClient(
      client,
      link,
      offer,
      input.method,
      input.dataSource
    );
    await client.query(
      `UPDATE retail_product_review_queue SET resolved_at=now(),last_seen_at=now() WHERE source=$1 AND external_product_id=$2`,
      [input.source, input.externalProductId]
    );
    return {
      status: created ? "CREATED" : "MATCHED",
      productId: product.productId,
      listingId: link.id,
      updated,
    };
  }
}
