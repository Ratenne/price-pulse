import type { Pool, PoolClient } from "pg";
import type { CollectionStatus } from "../domain/priceCollection";

export async function saveCollectionStatus(
  db: Pick<Pool | PoolClient, "query">,
  productId: string,
  stream: "CURRENT" | "HISTORY",
  result: CollectionStatus
) {
  await db.query(
    `INSERT INTO price_collection_status(product_id,source,stream,status,reason,checked_at)
     VALUES($1,'DANAWA',$2,$3,$4,$5::timestamptz)
     ON CONFLICT(product_id,source,stream,checked_at) DO NOTHING`,
    [productId, stream, result.status, result.reason, result.checkedAt]
  );
}
