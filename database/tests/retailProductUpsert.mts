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
  console.log(
    `${passed} PostgreSQL integration checks passed (${native ? "native multi-session" : "WASM single-session"}).`
  );
} finally {
  await cleanup();
}
