// Isolated PostgreSQL WASM verification; never reads DB_URL or opens a network
// connection. Install PGlite in a separate verification directory, or set
// PRICEPULSE_PGLITE_MODULE to its dist/index.js file URL. No runtime dependency.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { PgLivePriceSnapshotRepository } from "../../server/repositories/livePriceSnapshotRepository.ts";
import { PgPriceHistoryRepository } from "../../server/repositories/priceHistoryRepository.ts";
import { PgProductRepository } from "../../server/repositories/productRepository.ts";
import {
  refreshLivePriceSnapshot,
  refreshTrackedLivePriceSnapshot,
} from "../../server/services/livePriceSnapshot.ts";
import { refreshWeeklyPrices } from "../../server/services/weeklyPriceRefresh.ts";
import {
  DanawaBulkBackfillService,
  danawaBulkBackfillExitCode,
} from "../../server/services/danawaBulkBackfillService.ts";
import { parseDanawaMonthlyPrices } from "../../server/integrations/danawa/danawaPriceHistoryParser.ts";
import { DANAWA_GPU_CATEGORY } from "../../server/integrations/danawa/danawaCategory.ts";
import { createDanawaBulkBackfillConfig } from "../../server/config/danawaBackfill.ts";

const { PGlite } = await import(
  process.env.PRICEPULSE_PGLITE_MODULE ?? "@electric-sql/pglite"
);
const db = new PGlite();
const query = async (sql: string, params?: unknown[]) => {
  const r = await db.query(sql, params);
  return { ...r, rowCount: r.rows.length || r.affectedRows || 0 };
};
const pool = {
  query,
  connect: async () => ({ query, release() {} }),
} as unknown as Pool;
const logger = { info() {}, warn() {}, error() {} };
const migration = (name: string) =>
  readFileSync(new URL(`../${name}.sql`, import.meta.url), "utf8");
const live = new PgLivePriceSnapshotRepository(pool);
const monthly = new PgPriceHistoryRepository(pool);
const products = new PgProductRepository(pool);
const now = new Date("2026-10-20T01:00:00Z");
const at = (minute: number) =>
  new Date(now.getTime() + minute * 60_000).toISOString();
const rows = async (sql: string, params?: unknown[]) =>
  (await query(sql, params)).rows as Record<string, any>[];
const count = async (table: string) =>
  Number((await rows(`SELECT count(*) AS n FROM ${table}`))[0].n);
const events = async (id: string) =>
  rows(
    "SELECT * FROM price_observations WHERE product_id=$1 ORDER BY observed_at",
    [id]
  );
const save = (
  externalId: string,
  price: number,
  minute: number,
  shippingFee: number | null = null
) =>
  live.applyPrices(
    new Map([[externalId, price]]),
    at(minute),
    new Map([[externalId, { observedAt: at(minute), shippingFee }]])
  );

try {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  for (const name of [
    "001_initial_price_history",
    "002_product_discovery_fields",
    "003_reviewed_price_exclusions",
    "004_live_price_snapshot",
  ])
    await db.exec(migration(name));
  await db.exec(`INSERT INTO products(id,name,category,current_price) VALUES
    ('internal-a','GPU A','GPU',999),('internal-b','GPU B','GPU',888),('internal-c','GPU C','GPU',NULL),
    ('historical','GPU H','GPU',777),('reviewed','GPU R','GPU',666);
    INSERT INTO product_source_mappings(product_id,source,external_product_id,source_url)
    SELECT id,'DANAWA',code,'https://prod.danawa.com/info/?pcode='||code
    FROM (VALUES ('internal-a','101'),('internal-b','102'),('internal-c','103'),('historical','104'),('reviewed','105')) v(id,code);
    INSERT INTO price_histories(product_id,source,price,price_year_month,granularity,source_type) VALUES
    ('historical','DANAWA',700,'2026-09-01','MONTH','HISTORICAL_IMPORT'),
    ('reviewed','DANAWA',1,'2026-09-01','MONTH','HISTORICAL_IMPORT');
    INSERT INTO price_history_exclusions(price_history_id,observed_price,reason)
    SELECT id,price,'Reviewed invalid value' FROM price_histories WHERE product_id='reviewed';`);
  const before = await rows("SELECT * FROM price_histories ORDER BY id");
  const snapshotsBefore = await rows("SELECT * FROM products ORDER BY id");
  await db.exec(migration("009_price_observation_policy"));
  await db.exec(migration("009_price_observation_policy"));
  assert.deepEqual(
    await rows("SELECT * FROM price_histories ORDER BY id"),
    before
  );
  assert.deepEqual(
    await rows("SELECT * FROM products ORDER BY id"),
    snapshotsBefore
  );
  assert.equal(await count("price_observations"), 0); // No current_price copy.
  assert.deepEqual(
    (await live.findProductsWithoutHistory()).map(p => p.product_id),
    ["internal-a", "internal-b", "internal-c", "reviewed"]
  );
  for (const table of [
    "price_observations",
    "price_collection_status",
    "latest_price_collection_status",
    "products_without_price_history",
  ]) {
    assert.equal(
      (
        await rows(
          "SELECT has_table_privilege('anon',$1,'SELECT') AS allowed",
          [table]
        )
      )[0].allowed,
      false
    );
  }
  console.log(
    "PASS: migration repeatability, existing-data preservation, private objects, exact mapped gap detection"
  );

  // Existing current prices are preserved on failed reconfirmation, including NULL.
  await assert.rejects(
    () =>
      refreshLivePriceSnapshot(
        async () => {
          throw new Error("network");
        },
        live,
        logger,
        ["102"]
      ),
    /network/
  );
  assert.equal(await count("price_observations"), 0);
  assert.deepEqual(
    await rows("SELECT * FROM products ORDER BY id"),
    snapshotsBefore
  );
  await live.recordUnobserved([], at(0), "HTTP", ["102"]);
  assert.equal(
    (await rows("SELECT current_price FROM products WHERE id='internal-b'"))[0]
      .current_price,
    888
  );

  const first = await save("101", 100, 1);
  assert.equal(first.updated, 1);
  assert.deepEqual(first.outcomes[0], {
    externalId: "101",
    productId: "internal-a",
    status: "COMMITTED",
    eventType: "FIRST_OBSERVATION",
    firstObservation: true,
    basePriceChanged: null,
    shippingKnowledgeChanged: false,
  });
  assert.equal((await events("internal-a"))[0].event_type, "FIRST_OBSERVATION");
  assert.equal(
    (await events("internal-a"))[0].observed_at.toISOString(),
    at(1)
  );
  assert.equal((await events("internal-a"))[0].shipping_fee, null);
  const same = await save("101", 100, 1);
  assert.equal(same.updated, 0);
  assert.equal(same.outcomes[0].reason, "SAME_OBSERVATION");
  const unchanged = await save("101", 100, 2);
  assert.equal(unchanged.outcomes[0].basePriceChanged, false);
  assert.equal(unchanged.outcomes[0].eventType, undefined);
  assert.equal((await events("internal-a")).length, 1);
  assert.equal(Number((await events("internal-a"))[0].observation_count), 2);
  assert.equal(
    (await events("internal-a"))[0].last_observed_at.toISOString(),
    at(2)
  );
  await assert.rejects(
    () => save("101", 101, 2),
    (error: any) =>
      error.message === "OBSERVATION_CONFLICT" &&
      error.failureType === "OBSERVATION_CONFLICT" &&
      error.productId === "internal-a" &&
      error.executionStatus === "FAILED"
  );
  const changed = await save("101", 101, 3);
  assert.equal(changed.outcomes[0].basePriceChanged, true);
  assert.equal(changed.outcomes[0].eventType, "PRICE_CHANGE");
  await save("101", 102, 4);
  await save("101", 100, 5);
  assert.deepEqual(
    (await events("internal-a")).map(e => e.event_type),
    ["FIRST_OBSERVATION", "PRICE_CHANGE", "PRICE_CHANGE", "PRICE_CHANGE"]
  );
  assert.equal(
    (await save("101", 1, 0)).outcomes[0].reason,
    "OLDER_OBSERVATION"
  ); // Late result must not revert prices or add an event.
  assert.equal(
    (await rows("SELECT current_price FROM products WHERE id='internal-a'"))[0]
      .current_price,
    100
  );
  assert.equal((await events("internal-a")).length, 4);
  console.log(
    "PASS: failed first observation, real timestamp, repeated same price, same-month changes, stale results, replay conflicts"
  );

  await save("103", 200, 1, 3000);
  const shippingOnly = await save("103", 200, 2, 3001); // Shipping only, exactly one KRW.
  assert.equal(shippingOnly.outcomes[0].basePriceChanged, false);
  assert.equal(shippingOnly.outcomes[0].eventType, "PRICE_CHANGE");
  await save("103", 201, 3, 3000); // Equal total, different item AND shipping.
  await save("103", 201, 4, 3000);
  assert.equal((await events("internal-c")).length, 3);
  assert.deepEqual(
    (await events("internal-c")).map(e => Number(e.shipping_fee)),
    [3000, 3001, 3000]
  );
  assert.equal((await events("internal-c"))[1].event_type, "PRICE_CHANGE");
  assert.equal(Number((await events("internal-c"))[2].observation_count), 2);
  const shippingUnknown = await save("103", 201, 5, null);
  assert.equal(shippingUnknown.outcomes[0].basePriceChanged, false);
  assert.equal(shippingUnknown.outcomes[0].shippingKnowledgeChanged, true);
  assert.equal(
    (await events("internal-c"))[3].event_type,
    "OBSERVATION_BASELINE"
  );
  await save("103", 201, 6, 3000);
  assert.equal(
    (await events("internal-c"))[4].event_type,
    "OBSERVATION_BASELINE"
  );
  console.log(
    "PASS: shipping-only changes, equal-total changes, unknown shipping never treated as zero"
  );

  await save("104", 700, 1);
  assert.equal(
    (await events("historical"))[0].event_type,
    "OBSERVATION_BASELINE"
  );
  const imported = {
    priceYearMonth: "2026-09",
    price: 999,
    granularity: "MONTH" as const,
    sourceType: "HISTORICAL_IMPORT" as const,
  };
  assert.deepEqual(
    await monthly.saveMonthlyPrices("historical", "DANAWA", [imported]),
    {
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      comparisons: [
        {
          priceYearMonth: imported.priceYearMonth,
          existingPrice: 700,
          incomingPrice: imported.price,
          outcome: "CONFLICT",
          reason: "DIFFERENT_MONTHLY_PRICE",
        },
      ],
    }
  );
  assert.deepEqual(
    await rows("SELECT * FROM price_histories ORDER BY id"),
    before
  );
  const next = { ...imported, priceYearMonth: "2026-08", price: 600 };
  assert.equal(
    (await monthly.saveMonthlyPrices("historical", "DANAWA", [next, next]))
      .insertedCount,
    1
  );
  assert.equal(
    (await monthly.saveMonthlyPrices("historical", "DANAWA", [next]))
      .insertedCount,
    0
  );
  console.log(
    "PASS: existing-history baseline, immutable monthly rows, monthly backfill duplicates and observation coexistence"
  );

  // Discovery without a price must preserve the last successfully observed one.
  await products.upsertDanawaProduct({
    externalProductId: "101",
    name: "GPU A",
    category: "GPU",
    sourceUrl: "https://prod.danawa.com/info/?pcode=101",
  });
  assert.equal(
    (await rows("SELECT current_price FROM products WHERE id='internal-a'"))[0]
      .current_price,
    100
  );
  // A storage failure after event insert must roll back the whole product.
  const broken = new PgLivePriceSnapshotRepository({
    connect: async () => ({
      release() {},
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("UPDATE products SET"))
          throw new Error("injected write failure");
        return query(sql, params);
      },
    }),
  } as unknown as Pool);
  const oldEvents = await events("internal-a");
  await assert.rejects(
    () => broken.applyPrices(new Map([["101", 500]]), at(7)),
    /injected write failure/
  );
  assert.deepEqual(await events("internal-a"), oldEvents);
  assert.equal(
    (await rows("SELECT current_price FROM products WHERE id='internal-a'"))[0]
      .current_price,
    100
  );
  // Product A commits, product B fails; replay inserts no duplicate for A.
  await assert.rejects(
    () =>
      live.applyPrices(
        new Map([
          ["101", 500],
          ["102", 0],
        ]),
        at(7)
      ),
    /INVALID_OBSERVATION/
  );
  assert.equal(
    (
      await live.applyPrices(
        new Map([
          ["101", 500],
          ["102", 600],
        ]),
        at(7)
      )
    ).updated,
    1
  );
  assert.equal((await events("internal-a")).length, oldEvents.length + 1);
  assert.equal((await events("internal-b"))[0].event_type, "FIRST_OBSERVATION");
  console.log(
    "PASS: product-price preservation, transaction rollback, partial commit and safe rerun"
  );

  const noSource = parseDanawaMonthlyPrices(
    { "24": { count: 0 }, "12": { count: 0 }, "6": { count: 0 } },
    logger
  );
  const currentOnly = parseDanawaMonthlyPrices(
    { "24": { result: [{ date: "26-10", minPrice: 400 }] } },
    logger
  );
  const weekly = await refreshWeeklyPrices(
    [
      { product_id: "internal-a", external_product_id: "101" },
      { product_id: "internal-b", external_product_id: "102" },
      { product_id: "internal-c", external_product_id: "103" },
      { product_id: "internal-a", external_product_id: "101" },
    ],
    {
      collect: async id => {
        if (id === "101") return noSource;
        if (id === "102") return currentOnly;
        throw new Error("network failure");
      },
    },
    monthly,
    logger,
    now
  );
  assert.equal(weekly.processed, 3);
  assert.equal(weekly.failed, 1);
  assert.equal(weekly.successful, 2);
  assert.equal(weekly.noSourceData, 1);
  assert.equal(weekly.insufficientHistory, 1);
  assert.deepEqual(
    await rows(
      "SELECT product_id,status FROM latest_price_collection_status WHERE stream='HISTORY' ORDER BY product_id"
    ),
    [
      { product_id: "internal-a", status: "NO_SOURCE_DATA" },
      { product_id: "internal-b", status: "INSUFFICIENT_HISTORY" },
      { product_id: "internal-c", status: "COLLECTION_FAILED" },
    ]
  );
  // Current success cannot conceal a historical failure.
  assert.equal(
    (
      await rows(
        "SELECT status FROM latest_price_collection_status WHERE product_id='internal-c' AND stream='CURRENT'"
      )
    )[0].status,
    "NORMAL"
  );
  assert.equal(
    Number(
      (
        await rows(
          "SELECT count(*) n FROM price_collection_status WHERE product_id='internal-a' AND stream='CURRENT' AND status='NORMAL'"
        )
      )[0].n
    ),
    6
  );
  console.log(
    "PASS: all four states, current-only/absent history counted separately, deduplicated weekly targets, observation check audit trail"
  );

  // Fresh list observation is saved even if monthly history is absent or fails.
  const bulk = await new DanawaBulkBackfillService(
    {
      fetchPage: async () => ({
        page: 1,
        totalPages: 1,
        totalProductCount: 2,
        products: [
          {
            externalProductId: "106",
            name: "GPU New",
            category: "GPU",
            sourceUrl: "https://prod.danawa.com/info/?pcode=106",
            currentMinPrice: 800,
            observedAt: at(10),
          },
          {
            externalProductId: "107",
            name: "GPU Error",
            category: "GPU",
            sourceUrl: "https://prod.danawa.com/info/?pcode=107",
            currentMinPrice: 900,
            observedAt: at(10),
          },
        ],
      }),
    },
    products,
    {
      collect: async id => {
        if (id === "107") throw new Error("HTTP");
        return noSource;
      },
    },
    monthly,
    logger,
    {
      ...createDanawaBulkBackfillConfig(),
      targetHistoricalRowCount: 0,
      maxConcurrency: 1,
    },
    live
  ).run(DANAWA_GPU_CATEGORY, now);
  assert.equal(bulk.noSourceDataProducts, 1);
  assert.equal(bulk.failedProducts, 1);
  assert.equal((await events("danawa-106"))[0].item_price, 800);
  assert.equal((await events("danawa-107"))[0].item_price, 900);
  assert.equal(await count("products"), 7);
  assert.equal(await count("price_histories"), 3);
  await db.exec(migration("009_price_observation_policy"));
  assert.equal((await events("danawa-106")).length, 1);
  console.log(
    "PASS: discovery reuses fresh list prices despite absent/failed monthly data, no product deletion, migration after writes"
  );

  // The v1.4 acceptance case, using real repositories and isolated PostgreSQL.
  const warningBatch = new DanawaBulkBackfillService(
    {
      fetchPage: async () => ({
        page: 1,
        totalPages: 1,
        totalProductCount: 12,
        products: Array.from({ length: 12 }, (_, i) => ({
          externalProductId: String(90000 + i),
          name: `Warning GPU ${i}`,
          category: "GPU",
          sourceUrl: `https://prod.danawa.com/info/?pcode=${90000 + i}`,
        })),
      }),
    },
    products,
    {
      collect: async () => ({
        prices: [
          {
            priceYearMonth: "2026-09",
            price: 100,
            granularity: "MONTH",
            sourceType: "HISTORICAL_IMPORT",
          },
        ],
        receivedCount: 1,
        invalidCount: 0,
        selectedPeriod: 24,
      }),
    },
    monthly,
    logger,
    { ...createDanawaBulkBackfillConfig(), targetHistoricalRowCount: 0 },
    live
  );
  const seeded = await warningBatch.run(DANAWA_GPU_CATEGORY, now);
  assert.equal(seeded.insertedPrices, 12);
  const rawBefore = await rows("SELECT * FROM price_histories ORDER BY id");
  const currentBefore = await rows(
    "SELECT id,current_price,current_price_checked_at FROM products ORDER BY id"
  );
  const observationsBefore = await rows(
    "SELECT * FROM price_observations ORDER BY product_id,observed_at"
  );
  const repeated = await warningBatch.run(DANAWA_GPU_CATEGORY, now);
  assert.equal(danawaBulkBackfillExitCode(repeated), 0);
  assert.equal(repeated.successfulProducts, 12);
  assert.equal(repeated.failedProducts, 0);
  assert.equal(repeated.currentPriceFailures, 12);
  assert.equal(repeated.currentPriceFailureDetails.length, 12);
  assert.equal(repeated.insertedPrices, 0);
  assert.equal(repeated.updatedPrices, 0);
  assert.equal(repeated.skippedPrices, 12);
  assert.equal(repeated.duplicatePrices, 12);
  assert.equal(repeated.conflictingPrices, 0);
  assert.equal(repeated.incomparablePrices, 0);
  assert.deepEqual(
    await rows("SELECT * FROM price_histories ORDER BY id"),
    rawBefore
  );
  assert.deepEqual(
    await rows(
      "SELECT id,current_price,current_price_checked_at FROM products ORDER BY id"
    ),
    currentBefore
  );
  assert.deepEqual(
    await rows(
      "SELECT * FROM price_observations ORDER BY product_id,observed_at"
    ),
    observationsBefore
  );
  console.log(
    "PASS: 12 current-price warnings, duplicate-only rerun exits 0, raw/current/observed prices unchanged"
  );

  // Exercise the new fallback with real repository SQL and isolated data.
  const historyBeforeFallback = await rows(
    "SELECT * FROM price_histories ORDER BY id"
  );
  const failedBefore = (
    await rows(
      "SELECT current_price,current_price_checked_at FROM products WHERE id='internal-c'"
    )
  )[0];
  const trackedForFallback = await live.findTrackedProducts();
  const listPrices = new Map(
    trackedForFallback
      .filter(p => !["102", "103"].includes(p.external_product_id))
      .map(p => [p.external_product_id, 500])
  );
  const fallbackResult = await refreshTrackedLivePriceSnapshot(
    async () => ({ prices: listPrices, checkedAt: at(20) }),
    async targets => {
      assert.deepEqual(targets.map(p => p.external_product_id).sort(), [
        "102",
        "103",
      ]);
      return {
        prices: new Map([["102", 654]]),
        checkedAt: at(21),
        failures: new Map([["103", "PRODUCT_ID_NOT_FOUND"]]),
      };
    },
    live,
    logger
  );
  assert.equal(fallbackResult.retryTargets, 2);
  assert.equal(fallbackResult.retryObserved, 1);
  assert.equal(fallbackResult.failed, 1);
  assert.equal(fallbackResult.recordedFailureCandidates, 1);
  assert.equal(
    (await rows("SELECT current_price FROM products WHERE id='internal-b'"))[0]
      .current_price,
    654
  );
  assert.deepEqual(
    (
      await rows(
        "SELECT current_price,current_price_checked_at FROM products WHERE id='internal-c'"
      )
    )[0],
    failedBefore
  );
  assert.deepEqual(
    await rows("SELECT * FROM price_histories ORDER BY id"),
    historyBeforeFallback
  );
  assert.equal(
    (
      await rows(
        "SELECT reason FROM price_collection_status WHERE product_id='internal-c' AND stream='CURRENT' AND checked_at=$1",
        [at(21)]
      )
    )[0].reason,
    "PRODUCT_ID_NOT_FOUND"
  );
  console.log(
    "PASS: tracked fallback saves exact matches, preserves missing prices and monthly history"
  );
  assert.equal(fallbackResult.executionStatus, "PARTIAL_SUCCESS");

  // A later product's SQL failure must leave the earlier product committed.
  const failSecond = new PgLivePriceSnapshotRepository({
    query,
    connect: async () => ({
      release() {},
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("UPDATE products SET") && params?.[0] === "internal-b")
          throw new Error("injected second product failure");
        return query(sql, params);
      },
    }),
  } as unknown as Pool);
  const selectedProducts = trackedForFallback.filter(p =>
    ["101", "102"].includes(p.external_product_id)
  );
  const bBeforeFailure = (
    await rows(
      "SELECT current_price,current_price_checked_at FROM products WHERE id='internal-b'"
    )
  )[0];
  const logFailure = {
    info() {},
    warn() {},
    error: (...args: unknown[]) => {
      failureLog = args;
    },
  };
  let failureLog: unknown[] = [];
  await assert.rejects(
    () =>
      refreshTrackedLivePriceSnapshot(
        async () => ({
          prices: new Map([
            ["101", 777],
            ["102", 888],
          ]),
          checkedAt: at(22),
        }),
        async () => {
          throw new Error("unexpected fallback");
        },
        failSecond,
        logFailure,
        selectedProducts
      ),
    (error: any) =>
      error.failureType === "STORAGE_ERROR" &&
      error.stage === "UPDATE_CURRENT_PRICE" &&
      error.productId === "internal-b" &&
      error.committedOutcomes.some((o: any) => o.productId === "internal-a")
  );
  assert.equal(
    (await rows("SELECT current_price FROM products WHERE id='internal-a'"))[0]
      .current_price,
    777
  );
  assert.deepEqual(
    (
      await rows(
        "SELECT current_price,current_price_checked_at FROM products WHERE id='internal-b'"
      )
    )[0],
    bBeforeFailure
  );
  assert.equal((failureLog[1] as any).executionStatus, "FAILED");
  assert.deepEqual(
    await rows("SELECT * FROM price_histories ORDER BY id"),
    historyBeforeFallback
  );
  console.log(
    "PASS: SQL failure reports failed product and retains earlier committed price"
  );
} finally {
  await db.close();
}
