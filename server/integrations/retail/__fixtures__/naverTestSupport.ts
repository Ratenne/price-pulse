// Synthetic server approval for offline tests ONLY; never imported by runtime.
export const naverTestUrl =
  "https://smartstore.naver.com/unit-shop/products/123";
export const naverOtherTestUrl =
  "https://smartstore.naver.com/unit-shop/products/124";
export const naverTestNow = new Date("2026-10-20T00:00:00Z");
export const naverTestPolicy = {
  approvalStatus: "approved",
  methods: ["CRAWL"],
  accessGranted: true,
  thirdPartyProductsAllowed: true,
  storageAllowed: true,
  historyAnalysisAllowed: true,
  redisplayAllowed: true,
  usageLimitsVerified: true,
  termsUrl: "https://unit.example/terms",
  evidence: "synthetic approval, not Naver permission",
  approvedBy: "unit-test",
  verifiedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
  maxRequestsPerRun: 10,
  minDelayMs: 1500,
  requiresFixedIp: false,
  credentialEnvNames: [],
  crawl: {
    allowedUrls: [naverTestUrl, naverOtherTestUrl],
    automaticAccessAllowed: true,
    robotsVerified: true,
    parserVerified: true,
    databaseVerified: true,
    environmentVerified: true,
    evidence:
      "test-only transport and normalized-input fixture, not a Naver parser",
  },
};
export const naverTestOptions = {
  policies: { NAVER: naverTestPolicy },
  env: { RETAIL_NAVER_ENABLED: "true" },
  clock: () => naverTestNow,
};
