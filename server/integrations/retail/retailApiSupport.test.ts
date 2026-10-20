import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RETAIL_API_SOURCES,
  missingRetailApiCredentials,
  retailApiCredentialEnvNames,
  isRetailApiSource,
} from "./retailApiConfig";
import {
  retailApiReadiness,
  requireRetailApiAdapter,
} from "./retailApiSupport";
const now = new Date("2026-10-20T01:00:00Z");
const approved = {
  approvalStatus: "approved",
  methods: ["API"],
  apiAvailable: true,
  accessGranted: true,
  thirdPartyProductsAllowed: true,
  storageAllowed: true,
  historyAnalysisAllowed: true,
  redisplayAllowed: true,
  usageLimitsVerified: true,
  termsUrl: "https://provider.example/terms",
  evidence: "synthetic test approval",
  approvedBy: "test",
  verifiedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
  maxRequestsPerRun: 10,
  minDelayMs: 1500,
  requiresFixedIp: false,
};
afterEach(() => vi.unstubAllGlobals());
describe.each(RETAIL_API_SOURCES)("%s API support boundary", source => {
  const names = retailApiCredentialEnvNames[source];
  const complete = Object.fromEntries([
    [`RETAIL_${source}_ENABLED`, "true"],
    ...names.map(name => [name, "unit-secret-do-not-log"]),
  ]);
  const policies = { [source]: { ...approved, credentialEnvNames: names } };
  it("treats absent configuration as inactive", () => {
    const state = retailApiReadiness(source, { env: {}, now });
    expect(state).toMatchObject({
      allowed: false,
      status: "NOT_CONFIGURED",
      adapterImplemented: false,
    });
    expect(state.missingCredentialEnvNames).toEqual(names);
  });
  it("does not turn credentials or enablement into approval", () => {
    expect(retailApiReadiness(source, { env: complete, now })).toMatchObject({
      allowed: false,
      status: "NOT_APPROVED",
    });
  });
  it("requires every documented credential part", () => {
    for (const name of names) {
      const env = { ...complete, [name]: "" };
      expect(missingRetailApiCredentials(source, env)).toEqual([name]);
      expect(retailApiReadiness(source, { env, policies, now })).toMatchObject({
        allowed: false,
        status: "NOT_CONFIGURED",
      });
    }
  });
  it("cannot be activated by a synthetic approved policy without an actual collector", () => {
    const state = retailApiReadiness(source, { env: complete, policies, now });
    expect(state).toMatchObject({
      allowed: false,
      status: "UNSUPPORTED",
      adapterImplemented: false,
    });
    expect(JSON.stringify(state)).not.toContain("unit-secret-do-not-log");
  });
  it("never sends HTTP or returns a fake empty-list success", () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{"fake":"not a provider fixture"}', { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(() =>
      requireRetailApiAdapter(source, { env: complete, policies, now })
    ).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
it("keeps the four marketplaces and their seller credentials distinct", () => {
  expect(isRetailApiSource("NAVER")).toBe(false);
  expect(retailApiCredentialEnvNames.GMARKET).toContain(
    "RETAIL_GMARKET_SELLER_ID"
  );
  expect(retailApiCredentialEnvNames.GMARKET).not.toContain(
    "RETAIL_AUCTION_SELLER_ID"
  );
  expect(retailApiCredentialEnvNames.AUCTION).toContain(
    "RETAIL_AUCTION_SELLER_ID"
  );
});
