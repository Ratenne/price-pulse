import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const directory = mkdtempSync(path.join(tmpdir(), "retail-disabled-"));
const guard = path.join(directory, "network-guard.mjs");
writeFileSync(
  guard,
  `
import net from 'node:net';
function denied() { console.error('UNEXPECTED_NETWORK_CALL'); throw new Error('UNEXPECTED_NETWORK_CALL'); }
globalThis.fetch = denied;
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  // tsx uses a local Unix socket for its loader; external TCP stays blocked.
  const ipc = typeof first === 'string' ? first.startsWith('/') : typeof first?.path === 'string';
  return ipc ? originalConnect.apply(this, args) : denied();
};
`
);
afterAll(() => rmSync(directory, { recursive: true, force: true }));
function run(args: string[], overrides: NodeJS.ProcessEnv = {}) {
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("RETAIL_"))
  );
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      guard,
      "--import",
      "tsx",
      "server/scripts/refreshRetailPrices.ts",
      ...args,
    ],
    {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...cleanEnv,
        DB_URL: "invalid-database-url",
        RETAIL_TEST_KEY: "test-secret-do-not-log",
        ...overrides,
      },
    }
  );
  expect(result.error).toBeUndefined();
  const output = result.stdout + result.stderr;
  expect(output).not.toContain("UNEXPECTED_NETWORK_CALL");
  expect(output).not.toContain("test-secret-do-not-log");
  expect(output).not.toContain("phase3-credential-sentinel");
  return { status: result.status, output };
}
describe("retail manual entry points", () => {
  it("skips the default batch without connecting to retailers or the database", () => {
    const result = run([]);
    expect(result.status).toBe(2);
    expect(result.output).toContain('"succeeded":0');
    expect(result.output).toContain('"skipped":4');
    expect(result.output).toContain("NOT_CONFIGURED");
  });
  it("does not treat enabled flags or credentials as collection approval", () => {
    const result = run([], {
      RETAIL_11ST_ENABLED: "true",
      RETAIL_COUPANG_ENABLED: "true",
      RETAIL_GMARKET_ENABLED: "true",
      RETAIL_AUCTION_ENABLED: "true",
    });
    expect(result.status).toBe(2);
    expect(result.output).toContain('"NOT_APPROVED":4');
    expect(result.output).toContain('"succeeded":0');
  });
  it("disables the legacy probe before any network call", () => {
    const result = run(["--probe"]);
    expect(result.status).toBe(2);
    expect(result.output).toContain("HTML_COLLECTION_DISABLED");
    expect(result.output).toContain('"succeeded":0');
  });
  it("rejects unapproved file supply before even opening a database pool", () => {
    const input = path.join(directory, "observations.json");
    writeFileSync(
      input,
      JSON.stringify([
        {
          listingId: 1,
          source: "11ST",
          url: "https://www.11st.co.kr/products/1",
          externalProductId: "1",
          method: "IMPORT",
          dataSource: "test-only-file",
          title: "GPU",
          itemPrice: 100000,
          shippingFee: 0,
          currency: "KRW",
          condition: "NEW",
          availability: "IN_STOCK",
          conditional: false,
          observedAt: new Date().toISOString(),
        },
      ])
    );
    const result = run(["--import", input], { RETAIL_11ST_ENABLED: "true" });
    expect(result.status).toBe(1);
    expect(result.output).toContain("SOURCE_NOT_APPROVED");
    expect(result.output).not.toContain("observations imported");
  });
  it("keeps normalized product ingestion blocked without opening a database pool", () => {
    const file = path.join(directory, "products.json");
    writeFileSync(
      file,
      JSON.stringify([
        {
          source: "11ST",
          externalProductId: "1",
          title: "GPU",
          url: "https://www.11st.co.kr/products/1",
          method: "IMPORT",
          dataSource: "test-only",
          availability: "IN_STOCK",
        },
      ])
    );
    const result = run(["--products", file], { RETAIL_11ST_ENABLED: "true" });
    expect(result.status).toBe(2);
    expect(result.output).toContain("NOT_APPROVED");
    expect(result.output).toContain('"created":0');
    expect(result.output).toContain('"matched":0');
    expect(result.output).toContain('"updated":0');
  });
  it("reports all four API contracts without network, DB access or secret values", () => {
    const result = run(["--api-status"], {
      RETAIL_11ST_ENABLED: "true",
      RETAIL_11ST_API_KEY: "phase3-credential-sentinel",
      RETAIL_COUPANG_ENABLED: "true",
      RETAIL_COUPANG_ACCESS_KEY: "phase3-credential-sentinel",
      RETAIL_COUPANG_SECRET_KEY: "phase3-credential-sentinel",
      RETAIL_COUPANG_VENDOR_ID: "phase3-credential-sentinel",
      RETAIL_GMARKET_ENABLED: "true",
      RETAIL_AUCTION_ENABLED: "true",
      RETAIL_ESM_MASTER_ID: "phase3-credential-sentinel",
      RETAIL_ESM_SECRET_KEY: "phase3-credential-sentinel",
      RETAIL_ESM_ISSUER: "phase3-credential-sentinel",
      RETAIL_GMARKET_SELLER_ID: "phase3-credential-sentinel",
      RETAIL_AUCTION_SELLER_ID: "phase3-credential-sentinel",
    });
    expect(result.status).toBe(2);
    expect(result.output).toContain('"succeeded":0');
    expect(result.output).toContain('"skipped":4');
    expect(result.output).toContain('"adapterImplemented":false');
    for (const source of ["11ST", "COUPANG", "GMARKET", "AUCTION"])
      expect(result.output).toContain('"source":"' + source + '"');
    expect(result.output).not.toContain('"source":"NAVER"');
  });
  it("keeps the retail workflow manual-only", () => {
    const workflow = readFileSync(
      new URL(
        "../../.github/workflows/refresh-retail-prices.yml",
        import.meta.url
      ),
      "utf8"
    );
    expect(workflow).not.toMatch(/^\s*(schedule|cron):/m);
    expect(workflow).toContain("workflow_dispatch:");
  });
});
