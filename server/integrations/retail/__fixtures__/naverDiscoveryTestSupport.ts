// Synthetic reviewed evidence, offline tests ONLY. Not a Naver approval or
// captured live response. No runtime module imports this file.
import {
  normalizeNaverDiscovery,
  NAVER_BFF_DATA_SOURCE,
  NAVER_PROXY_DATA_SOURCE,
} from "../naverDiscovery.js";
import type { RetailDiscoveryCandidate } from "../../../domain/retailDiscovery.js";
import {
  naverVerifiedListingId,
  type NaverDiscoveryVerification,
} from "../../../services/naverDiscoveryImport.js";
import type { RetailProductReview } from "../../../domain/retailProduct.js";
export const discoveryNow = new Date("2026-10-21T00:10:00Z");
export const discoveryCaptureTime = "2026-10-21T00:00:00Z";
export function discoveryCandidate(price = 100000, seller = "unit-a") {
  return normalizeNaverDiscovery(
    {
      data: [
        {
          page: 1,
          slots: [
            {
              data: {
                nvMid: "70001",
                productNameOrg: "Test GPU",
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
    { observedAt: discoveryCaptureTime, receivedAt: discoveryNow.toISOString() }
  ).candidates[0];
}
export const discoveryPolicy = {
  approvalStatus: "approved",
  methods: ["IMPORT"],
  accessGranted: true,
  thirdPartyProductsAllowed: true,
  storageAllowed: true,
  historyAnalysisAllowed: true,
  redisplayAllowed: true,
  usageLimitsVerified: true,
  requiresFixedIp: false,
  termsUrl: "https://unit.example/terms",
  evidence: "test-only rights",
  approvedBy: "test",
  verifiedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
  maxRequestsPerRun: 10,
  minDelayMs: 1500,
  credentialEnvNames: [],
  discovery: {
    dataSources: [NAVER_BFF_DATA_SOURCE, NAVER_PROXY_DATA_SOURCE],
    accessGranted: true,
    evidence: "test-only source approval",
  },
};
export const discoveryOptions = {
  now: discoveryNow,
  env: { RETAIL_NAVER_ENABLED: "true" },
  policies: { NAVER: discoveryPolicy },
};
export function discoveryVerification(
  candidate: RetailDiscoveryCandidate,
  patch: Partial<NaverDiscoveryVerification> = {}
): NaverDiscoveryVerification {
  return {
    candidateKey: candidate.candidateKey,
    fingerprint: candidate.fingerprint,
    sellerId: "unit-seller-a",
    sellerProductId: "unit-listing-123",
    idNamespace: "SMARTSTORE_CHANNEL_PRODUCT",
    url: candidate.url!,
    identity: {
      manufacturer: "GIGABYTE",
      model: "RTX 5060",
      mpn: "UNIT-5060",
      variants: { memory: "8GB", overclock: "OC", bundle: "card only" },
      distributor: "피씨디렉트",
      warranty: "국내 3년",
    },
    itemPrice: candidate.displayedPrice!,
    displayedPrice: candidate.displayedPrice!,
    shippingFee: null,
    currency: "KRW",
    condition: "NEW",
    conditional: false,
    availability: "IN_STOCK",
    sourceVerified: true,
    priceMeaningVerified: true,
    observationTimeVerified: true,
    observedAt: candidate.observedAt ?? discoveryCaptureTime,
    reviewedAt: discoveryNow.toISOString(),
    expiresAt: "2099-01-01T00:00:00Z",
    reviewedBy: "unit-reviewer",
    evidence: "synthetic evidence, not real provider permission",
    ...patch,
  };
}
export function discoveryProductReview(
  v: NaverDiscoveryVerification,
  patch: Partial<RetailProductReview> = {}
): RetailProductReview {
  return {
    source: "NAVER",
    externalProductId: naverVerifiedListingId(v),
    approvalStatus: "approved",
    action: "CREATE",
    productName: "Reviewed GPU",
    category: "GPU",
    identity: v.identity,
    requiredOptionKeys: ["memory", "overclock", "bundle"],
    reviewedBy: "unit-reviewer",
    reviewedAt: v.reviewedAt,
    evidence: "synthetic product approval",
    ...patch,
  };
}
