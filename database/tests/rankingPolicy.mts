// Isolated SQL verification. Never reads DB credentials or accesses the network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import {
  parseProductQuery,
  readProductPage,
} from "../../server/services/productPage.ts";
import { PgLivePriceSnapshotRepository } from "../../server/repositories/livePriceSnapshotRepository.ts";
const { PGlite } = await import(
  process.env.PRICEPULSE_PGLITE_MODULE ?? "@electric-sql/pglite"
);
const db = new PGlite();
const query = async (sql: string, params?: unknown[]) => {
  const result = await db.query(sql, params);
  return {
    ...result,
    rowCount: result.rows.length || result.affectedRows || 0,
  };
};
const pool = {
  query,
  connect: async () => ({ query, release() {} }),
} as unknown as Pool;
const now = new Date("2026-10-20T03:00:00Z");
const page = async (params: string, date = now) => {
  const result = await readProductPage(
    pool,
    parseProductQuery(`/?${params}`),
    date
  );
  if (!("products" in result)) throw new Error("Expected products");
  return result;
};
const add = async (id: string) => {
  await query(
    "INSERT INTO products(id,name,category,current_price,current_price_checked_at) VALUES($1,$1,'GPU',12345,now())",
    [id]
  );
  await query(
    "INSERT INTO product_source_mappings(product_id,source,external_product_id,source_url) VALUES($1,'DANAWA',$1,'https://prod.danawa.com/info/?pcode='||$1)",
    [id]
  );
};
const month = (id: string, value: string, price: number) =>
  query(
    "INSERT INTO price_histories(product_id,source,price,price_year_month,granularity,source_type) VALUES($1,'DANAWA',$2,$3,'MONTH','HISTORICAL_IMPORT')",
    [id, price, value + "-01"]
  );
const live = new PgLivePriceSnapshotRepository(pool);
const observe = (id: string, price: number, at: string) =>
  live.applyPrices(new Map([[id, price]]), at);
try {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  for (const name of [
    "001_initial_price_history",
    "002_product_discovery_fields",
    "003_reviewed_price_exclusions",
    "004_live_price_snapshot",
    "008_retail_prices",
    "009_price_observation_policy",
  ]) {
    await db.exec(
      readFileSync(new URL(`../${name}.sql`, import.meta.url), "utf8")
    );
  }
  for (const id of [
    "complete",
    "partial",
    "none",
    "single",
    "constant",
    "exact",
    "before",
    "overlap",
    "source-empty",
    "failed",
    "reviewed",
  ])
    await add(id);
  for (const [index, value] of [
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
  ].entries()) {
    await month("complete", value, 100 + index * 20);
    if (index !== 3) await month("partial", value, 300 + index * 10);
  }
  await observe("complete", 1, "2026-10-01T00:00:00Z");
  await observe("single", 100, "2026-10-01T00:00:00Z");
  await observe("constant", 100, "2026-09-20T00:00:00Z");
  await observe("constant", 100, "2026-10-01T00:00:00Z");
  await observe("exact", 200, "2026-04-20T00:00:00+09:00");
  await observe("exact", 400, "2026-10-20T00:00:00+09:00");
  await observe("before", 100, "2026-04-20T00:00:00+09:00");
  await observe("before", 200, "2026-10-19T23:59:59.999+09:00");
  await month("overlap", "2026-09", 100);
  await observe("overlap", 9999, "2026-09-10T00:00:00Z");
  await observe("overlap", 8888, "2026-09-20T00:00:00Z");
  await observe("overlap", 200, "2026-10-01T00:00:00Z");
  await query(
    `INSERT INTO price_collection_status(product_id,source,stream,status,reason,checked_at) VALUES
    ('source-empty','DANAWA','HISTORY','NO_SOURCE_DATA','PRIVATE_REASON',$1),
    ('failed','DANAWA','HISTORY','COLLECTION_FAILED','PRIVATE_HTTP_ERROR',$1)`,
    ["2026-10-01T00:00:00Z"]
  );
  await month("reviewed", "2026-08", 1);
  await month("reviewed", "2026-09", 100);
  await query(`INSERT INTO price_history_exclusions(price_history_id,observed_price,reason)
    SELECT id,price,'PRIVATE_REVIEW' FROM price_histories WHERE product_id='reviewed' AND price=1`);

  const main = await page("view=home");
  assert.deepEqual(
    main.products.map(p => p.id),
    ["exact", "complete"]
  ); // Same rate, absolute-range tie break.
  const complete = main.products.find(p => p.id === "complete")!;
  assert.equal(complete.priceRangeAmount, 100);
  assert.equal(complete.sixMonthLowPrice, 100); // Current-month observation of 1 did not rewrite the established metric.
  assert.equal(complete.analysis?.observationCount, 6);
  assert.equal(complete.analysis?.rankingPeriod, "SIX_MONTHS");
  assert.equal(complete.currentPrice, 12345); // Existing fresh snapshot retained.
  console.log(
    "PASS: six completed months, unchanged historical metrics and current price, main ranking excludes short/single/empty products"
  );

  const short = await page("view=rankings&period=under-six-months");
  assert.deepEqual(
    new Set(short.products.map(p => p.id)),
    new Set(["partial", "constant", "before", "overlap"])
  );
  const constant = short.products.find(p => p.id === "constant")!;
  assert.equal(constant.analysis?.observationCount, 2);
  assert.equal(constant.priceRangeAmount, 0); // Two real observations at the same price.
  assert.equal(constant.priceRangeRate, 0);
  const overlap = short.products.find(p => p.id === "overlap")!;
  assert.equal(overlap.analysis?.observationCount, 2); // One month + one nonoverlapping current observation.
  assert.equal(overlap.priceRangeAmount, 100);
  assert.equal(overlap.analysis?.firstHistoryMonth, "2026-09");
  assert.ok(overlap.analysis?.firstObservedAt);
  console.log(
    "PASS: short ranking, constant-price observations, no monthly/observation double counting, actual period metadata"
  );

  const catalog = await page("view=rankings&period=all&sort=price-asc");
  assert.equal(catalog.total, 11);
  const last = await page("view=rankings&period=all&sort=price-asc&page=2");
  assert.equal(last.products.length, 1);
  for (const id of ["none", "single", "source-empty", "failed", "reviewed"]) {
    const detail = await page(`view=detail&id=${id}`);
    const product = detail.products[0];
    assert.equal(product.id, id);
    assert.equal(product.priceRangeAmount, null);
    assert.equal(product.priceRangeRate, null);
    assert.equal(product.sixMonthLowPrice, null);
    assert.equal(product.fairPriceMin, null);
    assert.equal(product.priceStatus, "INSUFFICIENT_DATA");
    assert.equal(product.currentPrice, 12345);
    assert.equal(product.analysis?.comparable, false);
    assert.ok(!JSON.stringify(detail).includes("PRIVATE_"));
    if (id === "source-empty")
      assert.equal(product.analysis?.dataStatus, "NO_SOURCE_DATA");
    if (id === "failed")
      assert.equal(product.analysis?.dataStatus, "COLLECTION_FAILED");
  }
  console.log(
    "PASS: one/zero observation => null analysis, preserved catalog/detail/current prices, four states, no private collection errors exposed"
  );

  for (const [id, first, final] of [
    ["month-end", "2026-08-31T01:00:00+09:00", "2027-02-28T01:00:00+09:00"],
    ["leap", "2023-08-31T01:00:00+09:00", "2024-02-29T01:00:00+09:00"],
  ]) {
    await add(id);
    await observe(id, 100, first);
    await observe(id, 200, final);
    const result = await page(`view=detail&id=${id}`, new Date(final));
    assert.equal(result.products[0].analysis?.rankingPeriod, "SIX_MONTHS");
    const before = await page(
      `view=detail&id=${id}`,
      new Date(Date.parse(final) - 1)
    );
    assert.equal(before.products[0].analysis?.rankingPeriod, "INSUFFICIENT");
  }
  console.log(
    "PASS: exact six-month boundary, one millisecond before, KST month-end and leap-year clamping, no future evidence counted"
  );

  for (let i = 0; i < 12; i++) {
    const id = `page-${String(i).padStart(2, "0")}`;
    await add(id);
    await observe(id, 100, "2026-10-01T00:00:00Z");
    await observe(id, 101 + i, "2026-10-02T00:00:00Z");
  }
  const firstPage = await page("view=rankings&period=under-six-months");
  const secondPage = await page("view=rankings&period=under-six-months&page=2");
  assert.equal(firstPage.pageSize, 10);
  assert.equal(firstPage.total, 16);
  assert.equal(firstPage.products.length, 10);
  assert.equal(secondPage.products.length, 6);
  assert.equal(
    new Set([...firstPage.products, ...secondPage.products].map(p => p.id))
      .size,
    16
  );
  assert.equal(
    (await query("SELECT count(*)::int AS n FROM price_histories")).rows[0].n,
    14
  );
  console.log(
    "PASS: separate ranking uses existing 10-row pagination without truncating the candidate set, history preserved"
  );
} finally {
  await db.close();
}
