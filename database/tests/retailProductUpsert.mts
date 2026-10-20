// PostgreSQL engine verification. Defaults to the existing separately installed
// PGlite runtime; no application dependency or production DB_URL is used.
// PRICEPULSE_RETAIL_TEST_PG_URL optionally runs the same suite, including real
// multi-session concurrency, in a disposable schema on a dedicated test server.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PgRetailProductRepository } from "../../server/repositories/retailProductRepository.ts";
import { PgRetailPriceRepository } from "../../server/repositories/retailPriceRepository.ts";
import {
  retailProductInputSchema,
  type RetailProductReview,
  type RetailProductInput,
} from "../../server/domain/retailProduct.ts";
import { upsertRetailProducts } from "../../server/services/retailProductUpsert.ts";
import { refreshNaverProducts } from "../../server/services/naverProductRefresh.ts";
import { naverTestPolicy } from "../../server/integrations/retail/__fixtures__/naverTestSupport.ts";
import { normalizeNaverDiscovery } from "../../server/integrations/retail/naverDiscovery.ts";
import {
  importNaverDiscovery,
  naverVerifiedListingId,
  type NaverDiscoveryVerification,
} from "../../server/services/naverDiscoveryImport.ts";
import {
  discoveryPolicy,
  discoveryVerification,
  discoveryProductReview,
} from "../../server/integrations/retail/__fixtures__/naverDiscoveryTestSupport.ts";
import {
  readProductPage,
  parseProductQuery,
} from "../../server/services/productPage.ts";

let db: any, pool: Pool, cleanup: () => Promise<void>;
const native = process.env.PRICEPULSE_RETAIL_TEST_PG_URL;
if (native) {
  const schema = `retail_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: native });
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = new Pool({
    connectionString: native,
    options: `-c search_path=${schema},public`,
  });
  cleanup = async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  };
} else {
  const { PGlite } = await import(
    process.env.PRICEPULSE_PGLITE_MODULE ?? "@electric-sql/pglite"
  );
  db = new PGlite();
  // A real PostgreSQL WASM connection, serialized like one pg client. This does
  // not claim to simulate parallel native connections or advisory-lock waits.
  let available = Promise.resolve();
  const connect = async () => {
    const prior = available;
    let release!: () => void;
    available = new Promise<void>(resolve => {
      release = resolve;
    });
    await prior;
    return {
      query: async (sql: string, params?: unknown[]) => {
        const result = params
          ? await db.query(sql, params)
          : (await db.exec(sql)).at(-1);
        return {
          ...result,
          rowCount: result.rows.length || result.affectedRows || 0,
        };
      },
      release,
    };
  };
  pool = {
    connect,
    query: async (sql: string, params?: unknown[]) => {
      const client = await connect();
      try {
        return await client.query(sql, params);
      } finally {
        client.release();
      }
    },
  } as unknown as Pool;
  cleanup = () => db.close();
}
const q = (sql: string, params?: unknown[]) => pool.query(sql, params);
const rows = async (sql: string, params?: unknown[]) =>
  (await q(sql, params)).rows;
const count = async (table: string, where = "true", params: unknown[] = []) =>
  Number(
    (await rows(`SELECT count(*) AS n FROM ${table} WHERE ${where}`, params))[0]
      .n
  );
const repository = new PgRetailProductRepository(pool);
const now = new Date();
const at = (minute: number) =>
  new Date(now.getTime() - 600_000 + minute * 60_000).toISOString();
function input(
  id: string,
  patch: Partial<RetailProductInput> = {}
): RetailProductInput {
  return retailProductInputSchema.parse({
    source: "11ST",
    externalProductId: id,
    url: `https://www.11st.co.kr/products/${id}`,
    title: `API GPU ${id}`,
    manufacturer: "GIGABYTE",
    model: `RTX 5060 ${id}`,
    mpn: `MPN-${id}`,
    variants: { memory: "8GB", overclock: "OC", bundle: "card only" },
    distributor: "피씨디렉트",
    warranty: "국내 정품 3년",
    itemPrice: 100000,
    shippingFee: 3000,
    currency: "KRW",
    condition: "NEW",
    availability: "IN_STOCK",
    conditional: false,
    observedAt: at(0),
    method: "IMPORT",
    dataSource: "mock-approved-feed",
    ...patch,
  });
}
function review(
  v: RetailProductInput,
  patch: Partial<RetailProductReview> = {}
): RetailProductReview {
  return {
    source: v.source,
    externalProductId: v.externalProductId,
    approvalStatus: "approved",
    action: "CREATE",
    productName: `Reviewed ${v.model}`,
    category: "GPU",
    identity: {
      manufacturer: v.manufacturer!,
      model: v.model!,
      mpn: v.mpn,
      variants: v.variants!,
      distributor: v.distributor!,
      warranty: v.warranty!,
    },
    requiredOptionKeys: ["memory", "overclock", "bundle"],
    reviewedBy: "test reviewer",
    reviewedAt: at(-10),
    evidence: "test-only approval",
    ...patch,
  };
}
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}
const migration = (name: string) =>
  readFileSync(new URL(`../${name}.sql`, import.meta.url), "utf8");
const apply = async (name: string) => {
  const client = await pool.connect();
  try {
    // pg's simple query protocol accepts transaction-wrapped multifile DDL.
    // PGlite.exec is used for the same SQL on the single isolated connection.
    if (db) await db.exec(migration(name));
    else await client.query(migration(name));
  } finally {
    client.release();
  }
};
try {
  if (db) await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  for (const name of [
    "001_initial_price_history",
    "002_product_discovery_fields",
    "003_reviewed_price_exclusions",
    "004_live_price_snapshot",
    "008_retail_prices",
    "009_price_observation_policy",
  ])
    await apply(name);
  await q(`INSERT INTO products(id,name,category,current_price,current_price_checked_at) VALUES('danawa-existing','Existing GPU','GPU',99999,now());
    INSERT INTO product_source_mappings(product_id,source,external_product_id,source_url) VALUES('danawa-existing','DANAWA','100','https://prod.danawa.com/info/?pcode=100');
    INSERT INTO price_histories(product_id,source,price,price_year_month,granularity,source_type) VALUES
    ('danawa-existing','DANAWA',90000,'2026-08-01','MONTH','HISTORICAL_IMPORT'),('danawa-existing','DANAWA',95000,'2026-09-01','MONTH','HISTORICAL_IMPORT');
    INSERT INTO retail_product_links(product_id,product_name,source,url,listing_name) VALUES
    ('danawa-existing','Existing GPU','11ST','https://www.11st.co.kr/products/100','Existing API GPU');
    INSERT INTO retail_price_observations(listing_id,observed_at,item_price,shipping_fee,method,link_version)
    SELECT id,now()-interval '30 minutes',100000,3000,'CRAWL',version FROM retail_product_links;
    INSERT INTO retail_current_offers(listing_id,observed_at,item_price,shipping_fee,link_version)
    SELECT listing_id,observed_at,item_price,shipping_fee,link_version FROM retail_price_observations;`);
  const originals = await rows("SELECT * FROM products ORDER BY id");
  const history = await rows("SELECT * FROM price_histories ORDER BY id");
  const retailBefore = await rows(
    "SELECT listing_id,observed_at,item_price,shipping_fee,method,link_version FROM retail_price_observations"
  );
  await check(
    "migration is repeatable and preserves legacy data and private access",
    async () => {
      await apply("010_retail_product_identity");
      await apply("010_retail_product_identity");
      await apply("011_retail_comparison_prices");
      await apply("011_retail_comparison_prices");
      assert.deepEqual(
        await rows("SELECT * FROM products ORDER BY id"),
        originals
      );
      assert.deepEqual(
        await rows("SELECT * FROM price_histories ORDER BY id"),
        history
      );
      assert.deepEqual(
        await rows(
          "SELECT listing_id,observed_at,item_price,shipping_fee,method,link_version FROM retail_price_observations"
        ),
        retailBefore
      );
      assert.equal(
        (
          await rows(
            "SELECT has_table_privilege('anon','retail_product_identities','SELECT') AS allowed"
          )
        )[0].allowed,
        false
      );
      assert.equal(
        (
          await rows(
            "SELECT has_table_privilege('authenticated','retail_product_review_queue','SELECT') AS allowed"
          )
        )[0].allowed,
        false
      );
    }
  );
  await check(
    "existing reviewed product keeps its ID and legacy history",
    async () => {
      const v = input("100", { title: "Existing API GPU" });
      const result = await repository.upsert(
        v,
        review(v, { action: "MATCH", productId: "danawa-existing" }),
        now
      );
      assert.equal(result.status, "MATCHED");
      assert.equal(
        "productId" in result && result.productId,
        "danawa-existing"
      );
      assert.equal(await count("products"), 1);
      assert.deepEqual(
        await rows("SELECT * FROM products ORDER BY id"),
        originals
      );
      assert.deepEqual(
        await rows("SELECT * FROM price_histories ORDER BY id"),
        history
      );
    }
  );
  const created = input("200");
  let createdId: string;
  await check(
    "only reviewed new products insert with a non-Danawa ID",
    async () => {
      const result = await repository.upsert(created, review(created), now);
      assert.equal(result.status, "CREATED");
      if (!("productId" in result)) throw Error("not created");
      createdId = result.productId;
      assert.match(createdId, /^retail-[a-f0-9]{64}$/);
      assert.equal(
        await count("product_source_mappings", "product_id=$1", [createdId]),
        0
      );
      assert.equal(
        (
          await rows("SELECT current_price FROM products WHERE id=$1", [
            createdId,
          ])
        )[0].current_price,
        null
      );
      assert.equal(
        Number(
          (
            await rows(
              "SELECT price FROM product_current_prices WHERE product_id=$1",
              [createdId]
            )
          )[0].price
        ),
        103000
      );
    }
  );
  await check(
    "a shared MPN with changed model spelling is held instead of duplicated",
    async () => {
      const v = input("203", {
        ...created,
        externalProductId: "203",
        url: "https://www.11st.co.kr/products/203",
        model: created.model + " alternate spelling",
      });
      const before = await count("products");
      const result = await repository.upsert(v, review(v), now);
      assert.equal(result.status, "HELD");
      assert.equal(await count("products"), before);
      // The physical PostgreSQL constraint also protects against out-of-band writers.
      await q(
        "INSERT INTO products(id,name,category) VALUES('test-mpn-duplicate','Duplicate','GPU')"
      );
      try {
        await assert.rejects(
          () =>
            q(
              `INSERT INTO retail_product_identities(product_id,identity_key,identity,required_option_keys,reviewed_by,reviewed_at,evidence)
        SELECT 'test-mpn-duplicate',repeat('a',64),jsonb_set(identity,'{model}','"changed spelling"'),required_option_keys,reviewed_by,reviewed_at,evidence
        FROM retail_product_identities WHERE product_id=$1`,
              [createdId!]
            ),
          /unique|duplicate/i
        );
      } finally {
        await q("DELETE FROM products WHERE id='test-mpn-duplicate'");
      }
    }
  );
  await check(
    "unverified and category-unknown products are held once without price writes",
    async () => {
      const v = input("300");
      assert.equal((await repository.upsert(v, undefined, now)).status, "HELD");
      const first = (
        await rows(
          "SELECT first_seen_at FROM retail_product_review_queue WHERE external_product_id='300'"
        )
      )[0];
      await repository.upsert(v, undefined, now);
      assert.equal(
        await count("retail_product_review_queue", "external_product_id='300'"),
        1
      );
      assert.deepEqual(
        (
          await rows(
            "SELECT first_seen_at FROM retail_product_review_queue WHERE external_product_id='300'"
          )
        )[0],
        first
      );
      const unknown = input("301");
      assert.equal(
        (
          await repository.upsert(
            unknown,
            review(unknown, { category: undefined }),
            now
          )
        ).status,
        "HELD"
      );
      assert.equal(
        await count(
          "retail_product_links",
          "external_product_id IN ('300','301')"
        ),
        0
      );
    }
  );
  await check(
    "title changes and multiple sources/listings share the verified identity",
    async () => {
      const renamed = {
        ...created,
        title: "Renamed product title",
        observedAt: at(1),
      };
      const a = await repository.upsert(renamed, undefined, now);
      const b = await repository.upsert(
        input("201", {
          ...created,
          externalProductId: "201",
          source: "GMARKET",
          url: "https://item.gmarket.co.kr/Item?goodsCode=201",
          itemPrice: 99000,
          observedAt: at(1),
        }),
        undefined,
        now
      );
      const c = await repository.upsert(
        input("202", {
          ...created,
          externalProductId: "202",
          url: "https://www.11st.co.kr/products/202",
          observedAt: at(1),
        }),
        undefined,
        now
      );
      for (const r of [a, b, c])
        assert.equal("productId" in r && r.productId, createdId!);
      assert.equal(
        await count("retail_product_links", "product_id=$1", [createdId!]),
        3
      );
      assert.equal(
        Number(
          (
            await rows(
              "SELECT price FROM product_current_prices WHERE product_id=$1",
              [createdId!]
            )
          )[0].price
        ),
        102000
      );
    }
  );
  await check(
    "memory, Ti, OC, manufacturer, distributor, warranty and bundles never merge",
    async () => {
      for (const patch of [
        { model: created.model + " Ti" },
        { manufacturer: "MSI" },
        { distributor: "제이씨현" },
        { warranty: "해외 보증" },
        { variants: { ...created.variants!, memory: "16GB" } },
        { variants: { ...created.variants!, overclock: "non-OC" } },
        { variants: { ...created.variants!, bundle: "two cards" } },
      ]) {
        const r = await repository.upsert(
          { ...created, ...patch, observedAt: at(2) },
          undefined,
          now
        );
        assert.equal(r.status, "HELD");
      }
      assert.equal(
        (
          await rows(
            "SELECT listing_name FROM retail_product_links WHERE external_product_id='200'"
          )
        )[0].listing_name,
        "Renamed product title"
      );
    }
  );
  await check(
    "missing shipping, zero price, unknown conditions and incomplete identity cannot insert",
    async () => {
      for (const patch of [
        { shippingFee: undefined },
        { itemPrice: 0 },
        { currency: undefined },
        { conditional: undefined },
        { observedAt: undefined },
        { manufacturer: undefined },
      ]) {
        const v = { ...input("400"), ...patch };
        const r = await repository.upsert(v, review(input("400")), now);
        assert.equal(r.status, "HELD");
      }
      assert.equal(
        await count("retail_product_links", "external_product_id='400'"),
        0
      );
    }
  );
  await check(
    "price rises, falls and one-won component changes are immutable observations",
    async () => {
      const base = input("500");
      await repository.upsert(base, review(base), now);
      for (const [minute, itemPrice, shippingFee] of [
        [1, 100001, 3000],
        [2, 99999, 3000],
        [3, 99998, 3001],
        [4, 99998, 3000],
      ])
        await repository.upsert(
          { ...base, itemPrice, shippingFee, observedAt: at(minute) },
          undefined,
          now
        );
      assert.equal(
        await count(
          "retail_price_observations",
          "listing_id IN (SELECT id FROM retail_product_links WHERE external_product_id='500')"
        ),
        5
      );
      const last = (
        await rows(
          "SELECT c.* FROM retail_current_offers c JOIN retail_product_links l ON l.id=c.listing_id WHERE external_product_id='500'"
        )
      )[0];
      assert.equal(Number(last.item_price), 99998);
      assert.equal(Number(last.shipping_fee), 3000);
      await repository.upsert(
        { ...base, itemPrice: 1, shippingFee: 0, observedAt: at(2.5) },
        undefined,
        now
      );
      assert.equal(
        Number(
          (
            await rows(
              "SELECT price FROM product_current_prices WHERE product_id=(SELECT product_id FROM retail_product_links WHERE external_product_id='500')"
            )
          )[0].price
        ),
        102998
      );
    }
  );
  await check(
    "same observation is idempotent; same-time prices or stock conflict and roll back",
    async () => {
      const v = input("600");
      await repository.upsert(v, review(v), now);
      await repository.upsert(v, undefined, now);
      await assert.rejects(
        () => repository.upsert({ ...v, itemPrice: 100001 }, undefined, now),
        /OBSERVATION_CONFLICT/
      );
      await assert.rejects(
        () =>
          repository.upsert(
            { ...v, availability: "OUT_OF_STOCK" },
            undefined,
            now
          ),
        /OBSERVATION_CONFLICT/
      );
      assert.equal(
        await count(
          "retail_price_observations",
          "listing_id IN (SELECT id FROM retail_product_links WHERE external_product_id='600')"
        ),
        1
      );
    }
  );
  await check(
    "stock-out is excluded; stale stock cannot resurrect it; recovery is timestamped",
    async () => {
      const v = input("700");
      const first = await repository.upsert(v, review(v), now);
      if (!("productId" in first)) throw Error("not created");
      await repository.upsert(
        {
          ...v,
          availability: "OUT_OF_STOCK",
          itemPrice: undefined,
          shippingFee: undefined,
          observedAt: at(3),
        },
        undefined,
        now
      );
      assert.equal(
        await count("product_current_prices", "product_id=$1", [
          first.productId,
        ]),
        0
      );
      await repository.upsert({ ...v, observedAt: at(2) }, undefined, now);
      assert.equal(
        await count("product_current_prices", "product_id=$1", [
          first.productId,
        ]),
        0
      );
      await repository.upsert({ ...v, observedAt: at(4) }, undefined, now);
      assert.equal(
        await count("product_current_prices", "product_id=$1", [
          first.productId,
        ]),
        1
      );
    }
  );
  await check(
    "listing URLs change without duplicating external ID or history",
    async () => {
      const v = {
        ...created,
        url: "https://www.11st.co.kr/products/999200",
        observedAt: at(5),
      };
      const result = await repository.upsert(v, undefined, now);
      assert.equal(result.status, "MATCHED");
      assert.equal(
        await count(
          "retail_product_links",
          "source='11ST' AND external_product_id='200'"
        ),
        1
      );
      assert.equal(
        (
          await rows(
            "SELECT url FROM retail_product_links WHERE source='11ST' AND external_product_id='200'"
          )
        )[0].url,
        v.url
      );
    }
  );
  await check(
    "database unique constraints reject external-ID and canonical identity duplicates",
    async () => {
      await assert.rejects(
        () =>
          q(`INSERT INTO retail_product_links(product_id,product_name,source,url,listing_name,external_product_id)
      SELECT product_id,product_name,source,'https://www.11st.co.kr/products/999999',listing_name,external_product_id FROM retail_product_links WHERE external_product_id='200'`),
        /unique|duplicate/i
      );
      await assert.rejects(
        () =>
          q(
            `INSERT INTO retail_product_identities(product_id,identity_key,identity,required_option_keys,reviewed_by,reviewed_at,evidence)
      SELECT 'danawa-existing',identity_key,identity,required_option_keys,reviewed_by,reviewed_at,evidence FROM retail_product_identities WHERE product_id=$1`,
            [createdId!]
          ),
        /unique|duplicate/i
      );
    }
  );
  await check(
    "database enforces valid stock prices, totals and foreign keys",
    async () => {
      await assert.rejects(
        () =>
          q(`INSERT INTO retail_price_observations(listing_id,observed_at,item_price,shipping_fee,method,link_version,availability)
      SELECT id,now(),100,NULL,'API',version,'IN_STOCK' FROM retail_product_links WHERE external_product_id='200'`),
        /check constraint/i
      );
      await assert.rejects(
        () =>
          q(`INSERT INTO retail_price_observations(listing_id,observed_at,item_price,shipping_fee,method,link_version,availability)
      SELECT id,now(),2000000000,1,'API',version,'IN_STOCK' FROM retail_product_links WHERE external_product_id='200'`),
        /check constraint/i
      );
      await assert.rejects(
        () =>
          q(`INSERT INTO retail_current_offers(listing_id,observed_at,item_price,shipping_fee,link_version,availability)
      VALUES(2147483647,now(),100,0,1,'IN_STOCK')`),
        /foreign key/i
      );
    }
  );
  await check(
    "simultaneous new inputs reuse one product and one mapping",
    async () => {
      const v = input("800");
      const result = await Promise.all([
        repository.upsert(v, review(v), now),
        repository.upsert(v, review(v), now),
      ]);
      assert.equal(result.filter(r => r.status === "CREATED").length, 1);
      assert.equal(
        new Set(result.map(r => ("productId" in r ? r.productId : null))).size,
        1
      );
      assert.equal(
        await count("retail_product_links", "external_product_id='800'"),
        1
      );
    }
  );
  await check(
    "required write failure rolls back all new rows and isolates the next product",
    async () => {
      await q(`CREATE FUNCTION fail_retail_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM retail_product_links WHERE id=NEW.listing_id AND external_product_id='900') THEN RAISE EXCEPTION 'test snapshot failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_snapshot_failure BEFORE INSERT ON retail_current_offers FOR EACH ROW EXECUTE FUNCTION fail_retail_snapshot();`);
      const a = input("900"),
        b = input("901");
      const policies = {
        "11ST": {
          approvalStatus: "approved",
          methods: ["IMPORT"],
          accessGranted: true,
          thirdPartyProductsAllowed: true,
          storageAllowed: true,
          historyAnalysisAllowed: true,
          redisplayAllowed: true,
          usageLimitsVerified: true,
          termsUrl: "https://provider.example/terms",
          evidence: "test",
          approvedBy: "reviewer",
          verifiedAt: at(-20),
          expiresAt: new Date(now.getTime() + 3600000).toISOString(),
          maxRequestsPerRun: 100,
          minDelayMs: 1500,
          requiresFixedIp: false,
          credentialEnvNames: [],
        },
      };
      const logger = { info() {}, warn() {}, error() {} };
      const result = await upsertRetailProducts(repository, logger, [a, b], {
        reviews: [review(a), review(b)],
        policies,
        env: { RETAIL_11ST_ENABLED: "true" },
        now,
      });
      assert.equal(result.failed, 1);
      assert.equal(result.created, 1);
      assert.equal(
        await count("retail_product_links", "external_product_id='900'"),
        0
      );
      assert.equal(
        await count("products", "name=$1", [review(a).productName]),
        0
      );
      assert.equal(
        await count(
          "retail_product_identities",
          "product_id NOT IN (SELECT id FROM products)"
        ),
        0
      );
      await q(
        "DROP TRIGGER test_snapshot_failure ON retail_current_offers; DROP FUNCTION fail_retail_snapshot();"
      );
    }
  );
  await check(
    "catalog, detail and live lookup expose retail-only products without fake monthly history",
    async () => {
      const detail = await readProductPage(
        pool,
        parseProductQuery(`/?view=detail&id=${createdId!}`)
      );
      assert.ok("products" in detail);
      assert.equal(detail.products[0].id, createdId!);
      assert.equal(detail.products[0].currentPriceSource, "GMARKET");
      assert.deepEqual(detail.products[0].priceHistory, []);
      assert.equal(
        detail.products[0].analysis?.dataStatus,
        "INSUFFICIENT_HISTORY"
      );
      const live = await readProductPage(
        pool,
        parseProductQuery(`/?view=live&ids=${createdId!}`)
      );
      assert.ok("prices" in live);
      assert.equal(live.prices[0].price, 102000);
      const category = await readProductPage(
        pool,
        parseProductQuery("/?view=category&category=GPU")
      );
      assert.ok("products" in category);
      assert.ok(category.products.some(p => p.id === createdId!));
      assert.deepEqual(
        await rows("SELECT * FROM price_histories ORDER BY id"),
        history
      );
      assert.deepEqual(
        await rows("SELECT * FROM products WHERE id='danawa-existing'"),
        originals
      );
    }
  );
  // Synthetic NORMALIZED inputs and a test Parser dependency only. No Naver
  // product HTML, network access or real product-ID namespace is asserted.
  const naverBase = retailProductInputSchema.parse({
    ...created,
    source: "NAVER",
    method: "CRAWL",
    externalProductId: "unit-naver-listing-123",
    url: "https://smartstore.naver.com/unit-shop/products/123",
    dataSource: "https://smartstore.naver.com/unit-shop/products/123",
    title: "Synthetic Naver GPU",
    itemPrice: 100000,
    shippingFee: 1000,
  });
  const naverRun = (
    inputs: RetailProductInput[],
    reviews: RetailProductReview[] = []
  ) => {
    const byUrl = new Map(inputs.map(v => [v.url, v]));
    return refreshNaverProducts(
      repository,
      { info() {}, warn() {}, error() {} },
      inputs.map(v => v.url),
      {
        env: { RETAIL_NAVER_ENABLED: "true" },
        clock: () => now,
        reviews,
        policies: {
          NAVER: {
            ...naverTestPolicy,
            verifiedAt: at(-20),
            expiresAt: new Date(now.getTime() + 3600000).toISOString(),
            crawl: {
              ...naverTestPolicy.crawl,
              allowedUrls: inputs.map(v => v.url),
            },
          },
        },
        collector: {
          collect: async url => ({
            url,
            html: "unused synthetic transport data",
            observedAt: byUrl.get(url)!.observedAt!,
          }),
        },
        parser: {
          verified: true,
          parse: page => ({ status: "PARSED", input: byUrl.get(page.url)! }),
        },
      }
    );
  };
  const otherRetailHistory = await rows(
    `SELECT o.* FROM retail_price_observations o JOIN retail_product_links l ON l.id=o.listing_id WHERE l.source<>'NAVER' ORDER BY o.listing_id,o.observed_at`
  );
  await check(
    "Naver normalized CRAWL shares an existing identity and the lowest-total view",
    async () => {
      const before = await count("products");
      const result = await naverRun([naverBase]);
      assert.equal(result.matched, 1);
      assert.equal(result.created, 0);
      assert.equal(await count("products"), before);
      const saved = (
        await rows(
          `SELECT l.product_id,o.method,o.data_source,o.item_price,o.shipping_fee
      FROM retail_product_links l JOIN retail_price_observations o ON o.listing_id=l.id WHERE l.source='NAVER' AND l.external_product_id=$1`,
          [naverBase.externalProductId]
        )
      )[0];
      assert.equal(saved.product_id, createdId!);
      assert.equal(saved.method, "CRAWL");
      assert.equal(saved.data_source, naverBase.url);
      assert.equal(Number(saved.item_price), 100000);
      assert.equal(Number(saved.shipping_fee), 1000);
      const lowest = (
        await rows(
          "SELECT source,price FROM product_current_prices WHERE product_id=$1",
          [createdId!]
        )
      )[0];
      assert.equal(lowest.source, "NAVER");
      assert.equal(Number(lowest.price), 101000);
    }
  );
  await check(
    "Naver one-won components, duplicate/conflicting and stale observations preserve history",
    async () => {
      for (const [minute, itemPrice, shippingFee] of [
        [1, 100001, 1000],
        [2, 99999, 1000],
        [3, 99998, 1001],
      ]) {
        assert.equal(
          (
            await naverRun([
              { ...naverBase, itemPrice, shippingFee, observedAt: at(minute) },
            ])
          ).matched,
          1
        );
      }
      const latest = {
        ...naverBase,
        itemPrice: 99998,
        shippingFee: 1001,
        observedAt: at(3),
      };
      const where =
        "listing_id IN (SELECT id FROM retail_product_links WHERE source='NAVER' AND external_product_id=$1)";
      assert.equal(
        await count("retail_price_observations", where, [
          naverBase.externalProductId,
        ]),
        4
      );
      const before = await rows(
        `SELECT * FROM retail_price_observations WHERE ${where} ORDER BY observed_at`,
        [naverBase.externalProductId]
      );
      assert.equal((await naverRun([latest])).updated, 0);
      assert.equal(
        (await naverRun([{ ...latest, itemPrice: latest.itemPrice + 1 }]))
          .failed,
        1
      );
      assert.deepEqual(
        await rows(
          `SELECT * FROM retail_price_observations WHERE ${where} ORDER BY observed_at`,
          [naverBase.externalProductId]
        ),
        before
      );
      await naverRun([
        { ...naverBase, itemPrice: 1, shippingFee: 0, observedAt: at(1.5) },
      ]);
      const current = (
        await rows(
          `SELECT item_price,shipping_fee FROM retail_current_offers WHERE ${where}`,
          [naverBase.externalProductId]
        )
      )[0];
      assert.equal(Number(current.item_price), 99998);
      assert.equal(Number(current.shipping_fee), 1001);
    }
  );
  await check(
    "Naver explicit stock-out, stale stock and recovery use the existing best-price view",
    async () => {
      assert.equal(
        (
          await naverRun([
            {
              ...naverBase,
              availability: "OUT_OF_STOCK",
              itemPrice: undefined,
              shippingFee: undefined,
              observedAt: at(4),
            },
          ])
        ).matched,
        1
      );
      let best = (
        await rows(
          "SELECT source,price FROM product_current_prices WHERE product_id=$1",
          [createdId!]
        )
      )[0];
      assert.equal(best.source, "GMARKET");
      await naverRun([{ ...naverBase, observedAt: at(3.5) }]);
      assert.equal(
        (
          await rows(
            "SELECT source FROM product_current_prices WHERE product_id=$1",
            [createdId!]
          )
        )[0].source,
        "GMARKET"
      );
      await naverRun([{ ...naverBase, shippingFee: 200, observedAt: at(5) }]);
      best = (
        await rows(
          "SELECT source,price FROM product_current_prices WHERE product_id=$1",
          [createdId!]
        )
      )[0];
      assert.equal(best.source, "NAVER");
      assert.equal(Number(best.price), 100200);
      const live = await readProductPage(
        pool,
        parseProductQuery(`/?view=live&ids=${createdId!}`)
      );
      assert.ok("prices" in live);
      assert.equal(live.prices[0].price, 100200);
    }
  );
  function naverNew(id: string) {
    const url = `https://brand.naver.com/unit-brand/products/${id}`;
    return input(id, {
      source: "NAVER",
      method: "CRAWL",
      externalProductId: `unit-naver-${id}`,
      url,
      dataSource: url,
    });
  }
  await check(
    "Naver incomplete/unreviewed products hold once; only server-reviewed new products insert",
    async () => {
      const unreviewed = naverNew("9100"),
        reviewed = naverNew("9101");
      const before = await count("products");
      assert.equal((await naverRun([unreviewed])).held, 1);
      assert.equal((await naverRun([unreviewed])).held, 1);
      assert.equal(
        await count(
          "retail_product_review_queue",
          "source='NAVER' AND external_product_id=$1",
          [unreviewed.externalProductId]
        ),
        1
      );
      assert.equal(
        (await naverRun([{ ...unreviewed, model: undefined }])).held,
        1
      );
      assert.equal(await count("products"), before);
      assert.equal((await naverRun([reviewed], [review(reviewed)])).created, 1);
      assert.equal(await count("products"), before + 1);
      const invalid = naverNew("9102");
      assert.equal(
        (
          await naverRun(
            [{ ...invalid, shippingFee: undefined }],
            [review(invalid)]
          )
        ).held,
        1
      );
      assert.equal(
        await count(
          "retail_product_links",
          "source='NAVER' AND external_product_id=$1",
          [invalid.externalProductId]
        ),
        0
      );
    }
  );
  await check(
    "Naver snapshot failure rolls back atomically without changing other sources or Danawa",
    async () => {
      const a = naverNew("9200"),
        b = naverNew("9201");
      await q(`CREATE FUNCTION fail_naver_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM retail_product_links WHERE id=NEW.listing_id AND source='NAVER' AND external_product_id='unit-naver-9200') THEN RAISE EXCEPTION 'unit snapshot failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_naver_failure BEFORE INSERT ON retail_current_offers FOR EACH ROW EXECUTE FUNCTION fail_naver_snapshot();`);
      try {
        const result = await naverRun([a, b], [review(a), review(b)]);
        assert.equal(result.failed, 1);
        assert.equal(result.created, 1);
        assert.equal(
          await count(
            "retail_product_links",
            "source='NAVER' AND external_product_id=$1",
            [a.externalProductId]
          ),
          0
        );
        assert.equal(
          await count("products", "name=$1", [review(a).productName]),
          0
        );
        assert.deepEqual(
          await rows(
            `SELECT o.* FROM retail_price_observations o JOIN retail_product_links l ON l.id=o.listing_id WHERE l.source<>'NAVER' ORDER BY o.listing_id,o.observed_at`
          ),
          otherRetailHistory
        );
        assert.deepEqual(
          await rows("SELECT * FROM price_histories ORDER BY id"),
          history
        );
        assert.deepEqual(
          await rows("SELECT * FROM products WHERE id='danawa-existing'"),
          originals
        );
      } finally {
        await q(
          "DROP TRIGGER test_naver_failure ON retail_current_offers; DROP FUNCTION fail_naver_snapshot();"
        );
      }
    }
  );
  const discovery = (
    price: number,
    seller = "discovery-a",
    observedAt = at(6)
  ) =>
    normalizeNaverDiscovery(
      {
        data: [
          {
            page: 1,
            slots: [
              {
                data: {
                  nvMid: "unit-shared-search-id",
                  productNameOrg: "Discovery GPU",
                  mallName: seller,
                  productUrl: {
                    pcUrl: `https://smartstore.naver.com/${seller}/products/123`,
                  },
                  salePrice: price,
                },
              },
            ],
          },
        ],
      },
      { observedAt, receivedAt: now.toISOString() }
    ).candidates[0];
  const vFor = (
    c: ReturnType<typeof discovery>,
    patch: Partial<NaverDiscoveryVerification> = {}
  ) =>
    discoveryVerification(c, {
      reviewedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3600000).toISOString(),
      sellerId: c.sellerName!,
      sellerProductId: "unit-channel-id",
      identity: {
        manufacturer: created.manufacturer!,
        model: created.model!,
        mpn: created.mpn,
        variants: created.variants!,
        distributor: created.distributor!,
        warranty: created.warranty!,
      },
      ...patch,
    });
  const discoveryImport = (
    candidates: ReturnType<typeof discovery>[],
    checks: NaverDiscoveryVerification[] = [],
    reviews: RetailProductReview[] = []
  ) =>
    importNaverDiscovery(
      repository,
      { info() {}, warn() {}, error() {} },
      candidates,
      {
        now,
        env: { RETAIL_NAVER_ENABLED: "true" },
        verifications: checks,
        reviews,
        policies: {
          NAVER: {
            ...discoveryPolicy,
            verifiedAt: at(-20),
            expiresAt: new Date(now.getTime() + 3600000).toISOString(),
          },
        },
      }
    );
  const candidate = discovery(80000),
    verification = vFor(candidate, { itemPrice: 99000 });
  const listingId = naverVerifiedListingId(verification);
  await check(
    "Discovery candidates hold once without listing or price writes and resolve only on verified promotion",
    async () => {
      const before = await count("retail_price_observations"),
        productsBefore = await count("products");
      assert.equal((await discoveryImport([candidate])).held, 1);
      assert.equal((await discoveryImport([candidate])).held, 1);
      assert.equal(
        await count("retail_product_review_queue", "external_product_id=$1", [
          candidate.candidateKey,
        ]),
        1
      );
      assert.equal(await count("retail_price_observations"), before);
      assert.equal(await count("products"), productsBefore);
      assert.equal(
        (await discoveryImport([candidate], [verification])).matched,
        1
      );
      assert.equal(await count("products"), productsBefore);
      assert.equal(
        await count(
          "retail_product_review_queue",
          "external_product_id=$1 AND resolved_at IS NOT NULL",
          [candidate.candidateKey]
        ),
        1
      );
    }
  );
  await check(
    "verified unknown shipping uses displayed price and preserves original amounts and public metadata",
    async () => {
      const saved = (
        await rows(
          `SELECT o.*,l.product_id FROM retail_price_observations o JOIN retail_product_links l ON l.id=o.listing_id WHERE l.source='NAVER' AND external_product_id=$1`,
          [listingId]
        )
      )[0];
      assert.equal(saved.product_id, createdId!);
      assert.equal(Number(saved.item_price), 99000);
      assert.equal(saved.shipping_fee, null);
      assert.equal(Number(saved.displayed_price), 80000);
      const current = (
        await rows("SELECT * FROM product_current_prices WHERE product_id=$1", [
          createdId!,
        ])
      )[0];
      assert.equal(Number(current.price), 80000);
      assert.equal(current.shipping_fee_known, false);
      assert.equal(current.comparison_basis, "DISPLAYED_PRICE");
      assert.equal(
        current.offers.find((v: any) => v.source === "NAVER").shippingFee,
        null
      );
      assert.equal(
        current.offers.find((v: any) => v.source === "NAVER").comparisonPrice,
        80000
      );
    }
  );
  await check(
    "unknown-to-free-to-positive shipping creates immutable observations including equal-total one-won changes",
    async () => {
      for (const [minute, itemPrice, shippingFee] of [
        [7, 80000, 0],
        [8, 80000, 3000],
        [8.25, 79999, 3001],
      ]) {
        const c = discovery(80000, "discovery-a", at(minute));
        assert.equal(
          (await discoveryImport([c], [vFor(c, { itemPrice, shippingFee })]))
            .matched,
          1
        );
        const snapshot = (
          await rows(
            "SELECT shipping_fee_known,price FROM product_current_prices WHERE product_id=$1",
            [createdId!]
          )
        )[0];
        assert.equal(snapshot.shipping_fee_known, true);
        assert.equal(Number(snapshot.price), itemPrice + shippingFee);
      }
      const unchanged = discovery(80000, "discovery-a", at(8.25));
      assert.equal(
        (
          await discoveryImport(
            [unchanged],
            [vFor(unchanged, { itemPrice: 79999, shippingFee: 3001 })]
          )
        ).updated,
        0
      );
      assert.equal(
        (
          await discoveryImport(
            [unchanged],
            [vFor(unchanged, { itemPrice: 79999, shippingFee: 3002 })]
          )
        ).failed,
        1
      );
      const stale = discovery(1, "discovery-a", at(6.5));
      await discoveryImport([stale], [vFor(stale)]);
      assert.equal(
        Number(
          (
            await rows(
              "SELECT price FROM product_current_prices WHERE product_id=$1",
              [createdId!]
            )
          )[0].price
        ),
        83000
      );
      assert.equal(
        await count(
          "retail_price_observations",
          "listing_id IN (SELECT id FROM retail_product_links WHERE external_product_id=$1)",
          [listingId]
        ),
        5
      );
      assert.equal(
        Number(
          (
            await rows(
              "SELECT item_price FROM retail_price_observations WHERE listing_id IN (SELECT id FROM retail_product_links WHERE external_product_id=$1) ORDER BY observed_at LIMIT 1",
              [listingId]
            )
          )[0].item_price
        ),
        99000
      );
    }
  );
  await check(
    "same nvMid at a second seller never merges listings and the same comparison price drives API sorting",
    async () => {
      const b = discovery(70000, "discovery-b", at(8.5)),
        vb = vFor(b);
      assert.equal((await discoveryImport([b], [vb])).matched, 1);
      assert.notEqual(naverVerifiedListingId(vb), listingId);
      assert.equal(
        await count(
          "retail_product_links",
          "external_product_id=ANY($1::text[])",
          [[listingId, naverVerifiedListingId(vb)]]
        ),
        2
      );
      assert.equal(
        (
          await rows(
            "SELECT url FROM product_current_prices WHERE product_id=$1",
            [createdId!]
          )
        )[0].url,
        vb.url
      );
      const detail = await readProductPage(
        pool,
        parseProductQuery(`/?view=detail&id=${createdId!}`)
      );
      assert.ok("products" in detail);
      assert.equal(detail.products[0].currentPrice, 70000);
      assert.equal(detail.products[0].currentPriceShippingFeeKnown, false);
      assert.equal(
        detail.products[0].currentPriceComparisonBasis,
        "DISPLAYED_PRICE"
      );
      const live = await readProductPage(
        pool,
        parseProductQuery(`/?view=live&ids=${createdId!}`)
      );
      assert.ok("prices" in live);
      assert.equal(live.prices[0].shippingFeeKnown, false);
      const name = (
        await rows("SELECT name FROM products WHERE id=$1", [createdId!])
      )[0].name;
      const list = await readProductPage(
        pool,
        parseProductQuery(
          `/?view=category&category=GPU&sort=price-asc&q=${encodeURIComponent(name)}`
        )
      );
      assert.ok("products" in list);
      assert.equal(list.products[0].currentPrice, 70000);
    }
  );
  await check(
    "a verified unknown-shipping observation still cannot auto-register an unreviewed new identity",
    async () => {
      const c = discovery(60000, "discovery-new"),
        v = vFor(c);
      v.identity = {
        ...v.identity,
        model: "New Discovery Model",
        mpn: "UNIT-NEW-DISCOVERY",
      };
      const before = await count("products");
      assert.equal((await discoveryImport([c], [v])).held, 1);
      assert.equal(await count("products"), before);
      assert.equal(
        (await discoveryImport([c], [v], [discoveryProductReview(v)])).created,
        1
      );
      assert.equal(await count("products"), before + 1);
      assert.equal(
        (
          await rows(
            "SELECT shipping_fee FROM retail_price_observations WHERE listing_id IN (SELECT id FROM retail_product_links WHERE external_product_id=$1)",
            [naverVerifiedListingId(v)]
          )
        )[0].shipping_fee,
        null
      );
    }
  );
  await check(
    "failed Discovery promotion rolls back price/product/queue resolution and preserves Danawa",
    async () => {
      const c = discovery(50000, "discovery-rollback"),
        v = vFor(c);
      v.identity = {
        ...v.identity,
        model: "Rollback Discovery",
        mpn: "UNIT-ROLLBACK-DISCOVERY",
      };
      await discoveryImport([c]);
      const before = await count("products");
      await q(`CREATE FUNCTION fail_discovery_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM retail_product_links WHERE id=NEW.listing_id AND external_product_id LIKE '%discovery-rollback%') THEN RAISE EXCEPTION 'unit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_discovery_failure BEFORE INSERT ON retail_current_offers FOR EACH ROW EXECUTE FUNCTION fail_discovery_snapshot();`);
      try {
        assert.equal(
          (await discoveryImport([c], [v], [discoveryProductReview(v)])).failed,
          1
        );
        assert.equal(await count("products"), before);
        assert.equal(
          await count("retail_product_links", "external_product_id=$1", [
            naverVerifiedListingId(v),
          ]),
          0
        );
        assert.equal(
          await count(
            "retail_product_review_queue",
            "external_product_id=$1 AND resolved_at IS NULL",
            [c.candidateKey]
          ),
          1
        );
        assert.deepEqual(
          await rows("SELECT * FROM price_histories ORDER BY id"),
          history
        );
        assert.deepEqual(
          await rows("SELECT * FROM products WHERE id='danawa-existing'"),
          originals
        );
        assert.equal(
          await count(
            "retail_price_observations",
            "shipping_fee IS NULL AND displayed_price IS NULL AND availability='IN_STOCK'"
          ),
          0
        );
      } finally {
        await q(
          "DROP TRIGGER test_discovery_failure ON retail_current_offers; DROP FUNCTION fail_discovery_snapshot();"
        );
      }
    }
  );
  console.log(
    `${passed} PostgreSQL integration checks passed (${native ? "native multi-session" : "WASM single-session"}).`
  );
} finally {
  await cleanup();
}
