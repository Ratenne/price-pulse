import { describe, it, expect } from "vitest";
import {
  checkRetailPolicy,
  checkRetailExecution,
  retailEnabledEnvNames,
} from "./retailPolicy";
const approved = {
  approvalStatus: "approved",
  methods: ["API", "IMPORT"],
  apiAvailable: true,
  accessGranted: true,
  thirdPartyProductsAllowed: true,
  storageAllowed: true,
  historyAnalysisAllowed: true,
  redisplayAllowed: true,
  usageLimitsVerified: true,
  termsUrl: "https://provider.example/terms",
  evidence: "test-only",
  approvedBy: "reviewer",
  verifiedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2027-01-01T00:00:00Z",
  maxRequestsPerRun: 10,
  minDelayMs: 1500,
  requiresFixedIp: false,
  credentialEnvNames: ["RETAIL_TEST_KEY"],
};
const now = new Date("2026-10-20T00:00:00Z");
function check(policy: unknown, env = { RETAIL_TEST_KEY: "secret" }) {
  return checkRetailPolicy("11ST", "API", {
    policies: { "11ST": policy },
    env,
    now,
  });
}
describe("retail source approval", () => {
  it("denies missing, pending, rejected, suspended and incomplete policy", () => {
    for (const approvalStatus of [
      undefined,
      "pending",
      "rejected",
      "suspended",
    ])
      expect(check({ ...approved, approvalStatus }).allowed).toBe(false);
    expect(check(undefined).allowed).toBe(false);
    expect(check({ approvalStatus: "approved" }).allowed).toBe(false);
  });
  it.each([
    "accessGranted",
    "thirdPartyProductsAllowed",
    "storageAllowed",
    "historyAnalysisAllowed",
    "redisplayAllowed",
    "usageLimitsVerified",
    "apiAvailable",
  ])("denies an unverified %s", field => {
    expect(check({ ...approved, [field]: false }).allowed).toBe(false);
  });
  it("denies expired, future, undocumented, fixed-IP, wrong-method and keyless approvals", () => {
    for (const patch of [
      { expiresAt: now.toISOString() },
      { verifiedAt: "2026-11-01T00:00:00Z" },
      { evidence: " " },
      { termsUrl: "" },
      { approvedBy: "" },
      { requiresFixedIp: true },
      { methods: ["IMPORT"] },
      { credentialEnvNames: [] },
      { credentialEnvNames: ["VITE_API_KEY"] },
      { maxRequestsPerRun: 0 },
      { minDelayMs: 0 },
    ])
      expect(check({ ...approved, ...patch }).allowed).toBe(false);
    expect(check(approved, { RETAIL_TEST_KEY: " " }).allowed).toBe(false);
    expect(check(approved).allowed).toBe(true);
  });
  it("keeps approved file supply independent of API availability and keys", () => {
    expect(
      checkRetailPolicy("11ST", "IMPORT", {
        policies: {
          "11ST": { ...approved, apiAvailable: false, credentialEnvNames: [] },
        },
        env: {},
        now,
      }).allowed
    ).toBe(true);
  });
});

describe("retail execution configuration", () => {
  it("defaults every retailer to NOT_CONFIGURED without credentials or flags", () => {
    for (const source of Object.keys(
      retailEnabledEnvNames
    ) as (keyof typeof retailEnabledEnvNames)[]) {
      expect(
        checkRetailExecution(source, {
          method: "API",
          adapterConfigured: false,
          env: {},
        })
      ).toMatchObject({ allowed: false, status: "NOT_CONFIGURED" });
    }
  });
  it("accepts only literal true and never interprets activation as approval", () => {
    for (const flag of [undefined, "", "false", "1", "TRUE"])
      expect(
        checkRetailExecution("11ST", {
          method: "API",
          adapterConfigured: true,
          env: { RETAIL_11ST_ENABLED: flag },
        })
      ).toMatchObject({ status: "NOT_CONFIGURED" });
    expect(
      checkRetailExecution("11ST", {
        method: "API",
        adapterConfigured: true,
        env: { RETAIL_11ST_ENABLED: "true", RETAIL_TEST_KEY: "secret" },
      })
    ).toMatchObject({ allowed: false, status: "NOT_APPROVED" });
  });
  it("requires all credential parts and a supported, implemented adapter", () => {
    const policy = {
      ...approved,
      credentialEnvNames: [
        "RETAIL_TEST_KEY",
        "RETAIL_TEST_SECRET",
        "RETAIL_TEST_ACCOUNT",
      ],
    };
    const options = {
      method: "API" as const,
      adapterConfigured: true,
      now,
      policies: { "11ST": policy },
      env: {
        RETAIL_11ST_ENABLED: "true",
        RETAIL_TEST_KEY: "key",
        RETAIL_TEST_SECRET: "secret",
        RETAIL_TEST_ACCOUNT: "account",
      },
    };
    for (const key of policy.credentialEnvNames)
      expect(
        checkRetailExecution("11ST", {
          ...options,
          env: { ...options.env, [key]: "" },
        })
      ).toMatchObject({ allowed: false, status: "NOT_CONFIGURED" });
    expect(
      checkRetailExecution("11ST", { ...options, adapterConfigured: false })
    ).toMatchObject({ allowed: false, status: "UNSUPPORTED" });
    expect(
      checkRetailExecution("11ST", {
        ...options,
        policies: { "11ST": { ...policy, apiAvailable: false } },
      })
    ).toMatchObject({ allowed: false, status: "UNSUPPORTED" });
    expect(checkRetailExecution("11ST", options).allowed).toBe(true);
  });
});
