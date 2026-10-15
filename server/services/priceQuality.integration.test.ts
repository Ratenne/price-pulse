import { readFileSync } from "node:fs";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool, getDatabasePool } from "../config/database";
import { parseProductQuery, readProductPage } from "./productPage";

// Opt-in PostgreSQL verification. All DDL and rows are transaction-local TEMP
// objects, shadowing real tables. No production rows or views are modified.
describe.skipIf(process.env.PRICEPULSE_DB_TESTS !== "true")(
  "reviewed price quality SQL",
  () => {
    let client: PoolClient;
    let migration: string;
    beforeAll(async () => {
      client = await getDatabasePool().connect();
      await client.query("BEGIN");
      await client.query(`
      CREATE TEMP TABLE products (LIKE public.products INCLUDING ALL);
      CREATE TEMP TABLE product_source_mappings (LIKE public.product_source_mappings INCLUDING ALL);
      CREATE TEMP TABLE price_histories (LIKE public.price_histories INCLUDING ALL);
      INSERT INTO products (id,name,category) VALUES
        ('danawa-101546711','Reviewed GPU','GPU'), ('danawa-control','Unreviewed GPU','GPU');
      INSERT INTO product_source_mappings (product_id,source,external_product_id,source_url) VALUES
        ('danawa-101546711','DANAWA','101546711','https://prod.danawa.com/info/?pcode=101546711'),
        ('danawa-control','DANAWA','999','https://prod.danawa.com/info/?pcode=999');
      INSERT INTO price_histories (product_id,source,price,price_year_month,granularity,source_type) VALUES
        ('danawa-101546711','DANAWA',1825960,'2026-07-01','MONTH','HISTORICAL_IMPORT'),
        ('danawa-101546711','DANAWA',1,'2026-08-01','MONTH','HISTORICAL_IMPORT'),
        ('danawa-101546711','DANAWA',2760680,'2026-09-01','MONTH','HISTORICAL_IMPORT'),
        ('danawa-control','DANAWA',100000,'2026-07-01','MONTH','HISTORICAL_IMPORT'),
        ('danawa-control','DANAWA',300000,'2026-08-01','MONTH','HISTORICAL_IMPORT'),
        ('danawa-control','DANAWA',300000,'2026-09-01','MONTH','HISTORICAL_IMPORT');
    `);
      migration = readFileSync(
        new URL(
          "../../database/003_reviewed_price_exclusions.sql",
          import.meta.url
        ),
        "utf8"
      )
        .replace(/^\s*(BEGIN|COMMIT);/gm, "")
        .replace(
          "CREATE TABLE IF NOT EXISTS price_history_exclusions",
          "CREATE TEMP TABLE IF NOT EXISTS price_history_exclusions"
        )
        .replaceAll("CREATE OR REPLACE VIEW", "CREATE OR REPLACE TEMP VIEW");
      await client.query(migration);
    });
    afterAll(async () => {
      if (client) {
        await client.query("ROLLBACK");
        client.release();
      }
      await closeDatabasePool();
    });
    it("preserves raw rows, filters analysis, and applies the same rule to ranking and summaries", async () => {
      const raw = await client.query(
        "SELECT price::int FROM price_histories WHERE price=1"
      );
      expect(raw.rows).toEqual([{ price: 1 }]);
      const result = await readProductPage(
        client as unknown as Pool,
        parseProductQuery("/?view=home"),
        new Date("2026-10-15T00:00:00Z")
      );
      if (!("products" in result)) throw new Error("Expected products");
      expect(result.products[0].id).toBe("danawa-control");
      expect(result.summaries[0].averageRangeRate).toBeCloseTo(
        (200 + ((2760680 - 1825960) / 1825960) * 100) / 2
      );
      const detail = await readProductPage(
        client as unknown as Pool,
        parseProductQuery("/?view=detail&id=danawa-101546711"),
        new Date("2026-10-15T00:00:00Z")
      );
      if (!("products" in detail)) throw new Error("Expected detail");
      expect(detail.products[0]).toMatchObject({
        sixMonthLowPrice: 1825960,
        sixMonthHighPrice: 2760680,
        sixMonthAveragePrice: 2293320,
        previousPrice: 2760680,
        excludedHistoryMonths: ["2026-08"],
        priceHistory: [
          { date: "2026-07", price: 1825960 },
          { date: "2026-09", price: 2760680 },
        ],
      });
    });
    it("is idempotent and does not re-exclude a source-corrected price", async () => {
      await client.query(migration);
      expect(
        (
          await client.query(
            "SELECT count(*)::int n FROM price_history_exclusions"
          )
        ).rows[0].n
      ).toBe(1);
      await client.query("SAVEPOINT correction");
      try {
        await client.query(
          "UPDATE price_histories SET price=1800000 WHERE price=1"
        );
        expect(
          (
            await client.query(
              "SELECT count(*)::int n FROM price_histories_for_analysis"
            )
          ).rows[0].n
        ).toBe(6);
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT correction");
      }
    });
    it("omits products with no usable history from ranking and category summaries", async () => {
      await client.query("SAVEPOINT all_excluded");
      try {
        await client.query(`INSERT INTO price_history_exclusions (price_history_id,observed_price,reason)
          SELECT id,price,'Test review' FROM price_histories WHERE product_id='danawa-101546711'
          ON CONFLICT DO NOTHING`);
        const result = await readProductPage(
          client as unknown as Pool,
          parseProductQuery("/?view=rankings"),
          new Date("2026-10-15T00:00:00Z")
        );
        expect("products" in result && result.products.map(p => p.id)).toEqual([
          "danawa-control",
        ]);
        expect("summaries" in result && result.summaries[0].productCount).toBe(
          1
        );
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT all_excluded");
      }
    });
    it("supports reversing a review without altering the source history", async () => {
      await client.query("SAVEPOINT revocation");
      try {
        await client.query(
          "UPDATE price_history_exclusions SET revoked_at=now()"
        );
        expect(
          (
            await client.query(
              "SELECT price::int FROM price_histories_for_analysis WHERE price=1"
            )
          ).rows
        ).toEqual([{ price: 1 }]);
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT revocation");
      }
    });
  }
);
