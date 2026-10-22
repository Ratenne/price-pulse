import { describe, expect, it, vi } from "vitest";
import { upsertRetailProducts } from "./retailProductUpsert";
const input = {
  source: "11ST",
  externalProductId: "1",
  title: "GPU",
  url: "https://www.11st.co.kr/products/1",
  method: "IMPORT",
  dataSource: "test",
  availability: "IN_STOCK",
};
const policy = {
  approvalStatus: "approved",
  methods: ["IMPORT", "API"],
  apiAvailable: true,
  accessGranted: true,
  thirdPartyProductsAllowed: true,
  storageAllowed: true,
  historyAnalysisAllowed: true,
  redisplayAllowed: true,
  usageLimitsVerified: true,
  termsUrl: "https://provider.example/terms",
  evidence: "test",
  approvedBy: "reviewer",
  verifiedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
  maxRequestsPerRun: 100,
  minDelayMs: 1500,
  requiresFixedIp: false,
  credentialEnvNames: ["RETAIL_TEST_KEY"],
};
const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const repository = () => ({
  upsert: vi
    .fn()
    .mockResolvedValue({
      status: "MATCHED",
      productId: "existing",
      listingId: 1,
      updated: true,
    }),
});
const enabled = { RETAIL_11ST_ENABLED: "true" };
describe("retail normalized product batch", () => {
  it("blocks disabled and unapproved inputs before database access", async () => {
    for (const [env, status] of [
      [{}, "NOT_CONFIGURED"],
      [enabled, "NOT_APPROVED"],
    ] as const) {
      const repo = repository();
      expect(
        await upsertRetailProducts(repo, logger(), [input], { env })
      ).toMatchObject({
        skipped: 1,
        created: 0,
        matched: 0,
        skipStatuses: { [status]: 1 },
      });
      expect(repo.upsert).not.toHaveBeenCalled();
    }
  });
  it("requires API credentials and a real adapter, while allowing an approved file path", async () => {
    const policies = { "11ST": policy };
    const repo = repository();
    expect(
      await upsertRetailProducts(
        repo,
        logger(),
        [{ ...input, method: "API" }],
        { policies, env: enabled, adapterConfigured: true }
      )
    ).toMatchObject({ skipped: 1, skipStatuses: { NOT_CONFIGURED: 1 } });
    expect(
      await upsertRetailProducts(
        repo,
        logger(),
        [{ ...input, method: "API" }],
        { policies, env: { ...enabled, RETAIL_TEST_KEY: "secret" } }
      )
    ).toMatchObject({ skipped: 1, skipStatuses: { UNSUPPORTED: 1 } });
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(
      await upsertRetailProducts(repo, logger(), [input], {
        policies,
        env: enabled,
      })
    ).toMatchObject({ matched: 1, updated: 1 });
  });
  it("isolates item failures and never logs provider errors or credentials", async () => {
    const repo = repository();
    const log = logger();
    repo.upsert.mockRejectedValueOnce(
      new Error("secret SQL credential/payload")
    );
    expect(
      await upsertRetailProducts(
        repo,
        log,
        [input, { ...input, externalProductId: "2" }],
        { policies: { "11ST": policy }, env: enabled }
      )
    ).toMatchObject({ failed: 1, matched: 1, updated: 1 });
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(
      "secret SQL credential/payload"
    );
  });
  it("counts review holds separately and rejects invalid input without persistence", async () => {
    const repo = repository();
    repo.upsert.mockResolvedValue({
      status: "HELD",
      reason: "INCOMPLETE_IDENTITY",
      candidates: [],
    });
    expect(
      await upsertRetailProducts(
        repo,
        logger(),
        [input, { ...input, condition: "USED" }],
        { policies: { "11ST": policy }, env: enabled }
      )
    ).toMatchObject({ held: 1, failed: 1, created: 0, matched: 0, updated: 0 });
    expect(repo.upsert).toHaveBeenCalledTimes(1);
  });
});
