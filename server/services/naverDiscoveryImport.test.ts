import { describe, expect, it, vi } from "vitest";
import { normalizeNaverDiscovery } from "../integrations/retail/naverDiscovery";
import {
  importNaverDiscovery,
  naverDiscoveryVerificationSchema,
  naverVerifiedListingId,
} from "./naverDiscoveryImport";
import {
  discoveryCandidate,
  discoveryOptions,
  discoveryPolicy,
  discoveryVerification,
} from "../integrations/retail/__fixtures__/naverDiscoveryTestSupport";
const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const repository = () => ({
  holdCandidate: vi.fn().mockResolvedValue({
    status: "HELD",
    reason: "DISCOVERY_VERIFICATION_REQUIRED",
    candidates: [],
  }),
  upsert: vi.fn().mockResolvedValue({
    status: "MATCHED",
    productId: "existing",
    listingId: 1,
    updated: true,
  }),
});
describe("Discovery-to-observation server verification boundary", () => {
  it("does not promote an explicitly conditional coupon price", async () => {
    const c = normalizeNaverDiscovery({
      data: [
        {
          slots: [
            {
              data: {
                productNameOrg: "GPU",
                nvMid: "1",
                couponDiscountedPrice: 100000,
                productUrl: {
                  pcUrl: "https://smartstore.naver.com/unit-a/products/123",
                },
              },
            },
          ],
        },
      ],
    }).candidates[0];
    const repo = repository();
    expect(
      await importNaverDiscovery(repo, logger(), [c], {
        ...discoveryOptions,
        verifications: [discoveryVerification(c)],
      })
    ).toMatchObject({ held: 1, updated: 0 });
    expect(repo.upsert).not.toHaveBeenCalled();
  });
  it("does not even write holds without source and storage approval", async () => {
    for (const options of [
      { env: {} },
      { env: discoveryOptions.env },
      {
        ...discoveryOptions,
        policies: { NAVER: { ...discoveryPolicy, discovery: undefined } },
      },
      {
        ...discoveryOptions,
        policies: { NAVER: { ...discoveryPolicy, storageAllowed: false } },
      },
    ]) {
      const repo = repository();
      expect(
        await importNaverDiscovery(
          repo,
          logger(),
          [discoveryCandidate()],
          options
        )
      ).toMatchObject({ skipped: 1, created: 0, updated: 0 });
      expect(repo.upsert).not.toHaveBeenCalled();
      expect(repo.holdCandidate).not.toHaveBeenCalled();
    }
  });
  it("holds a search candidate without promoting it, even with source permission", async () => {
    const candidate = discoveryCandidate(),
      repo = repository();
    expect(
      await importNaverDiscovery(repo, logger(), [candidate], discoveryOptions)
    ).toMatchObject({ held: 1, updated: 0 });
    expect(repo.holdCandidate).toHaveBeenCalledWith(
      {
        source: "NAVER",
        externalProductId: candidate.candidateKey,
        title: candidate.title,
      },
      "DISCOVERY_VERIFICATION_REQUIRED"
    );
    expect(repo.upsert).not.toHaveBeenCalled();
  });
  it.each([null, 0, 3000])(
    "passes a separately verified %s shipping fee and displayed amount through Phase 2",
    async shippingFee => {
      const candidate = discoveryCandidate(),
        v = discoveryVerification(candidate, { shippingFee }),
        repo = repository();
      expect(
        await importNaverDiscovery(repo, logger(), [candidate], {
          ...discoveryOptions,
          verifications: [v],
        })
      ).toMatchObject({ matched: 1, updated: 1 });
      const input = repo.upsert.mock.calls[0][0];
      expect(input).toMatchObject({
        source: "NAVER",
        externalProductId: naverVerifiedListingId(v),
        method: "IMPORT",
        itemPrice: 100000,
        displayedPrice: 100000,
        shippingFee,
        observedAt: v.observedAt,
        dataSource: candidate.dataSource,
      });
      expect(input).not.toHaveProperty("candidateKey");
      expect(repo.upsert.mock.calls[0][3]).toBe(candidate.candidateKey);
    }
  );
  it("rejects changed evidence and provider approval flags rather than trusting a fingerprint string", async () => {
    const candidate = discoveryCandidate(),
      v = discoveryVerification(candidate),
      repo = repository();
    for (const patch of [
      { displayedPrice: 1 },
      { model: "unverified" },
      { validationStatus: "APPROVED" },
      { approved: true },
    ]) {
      expect(
        await importNaverDiscovery(
          repo,
          logger(),
          [{ ...candidate, ...patch }],
          { ...discoveryOptions, verifications: [v] }
        )
      ).toMatchObject({ failed: 1, updated: 0 });
    }
    expect(repo.upsert).not.toHaveBeenCalled();
  });
  it("requires a fresh matching server record and does not infer observation time", async () => {
    const candidate = discoveryCandidate(),
      repo = repository(),
      v = discoveryVerification(candidate);
    for (const patch of [
      { fingerprint: "0".repeat(64) },
      { displayedPrice: 99999 },
      { observedAt: "2026-10-20T00:00:00Z" },
      { expiresAt: discoveryOptions.now.toISOString() },
      { reviewedAt: "2099-01-01T00:00:00Z" },
    ]) {
      expect(
        await importNaverDiscovery(repo, logger(), [candidate], {
          ...discoveryOptions,
          verifications: [{ ...v, ...patch }],
        })
      ).toMatchObject({ held: 1, updated: 0 });
    }
    expect(repo.upsert).not.toHaveBeenCalled();
  });
  it("validates all verification fields and keeps seller/listing namespaces separate", () => {
    const v = discoveryVerification(discoveryCandidate());
    for (const patch of [
      { priceMeaningVerified: false },
      { sourceVerified: false },
      { observationTimeVerified: false },
      { conditional: true },
      { url: "https://shopping.naver.com/catalog/123" },
      { sellerId: "" },
    ])
      expect(
        naverDiscoveryVerificationSchema.safeParse({ ...v, ...patch }).success
      ).toBe(false);
    expect(naverVerifiedListingId(v)).not.toBe(
      naverVerifiedListingId({ ...v, sellerId: "different" })
    );
  });
  it("keeps conflicting Discovery prices on hold and never silently picks one", async () => {
    const first = discoveryCandidate(),
      changed = discoveryCandidate(99999),
      repo = repository();
    expect(first.candidateKey).toBe(changed.candidateKey);
    expect(
      await importNaverDiscovery(repo, logger(), [first, changed], {
        ...discoveryOptions,
        verifications: [discoveryVerification(first)],
      })
    ).toMatchObject({ held: 2, updated: 0 });
    expect(repo.upsert).not.toHaveBeenCalled();
  });
  it("preserves item failure isolation and never logs raw provider/SQL errors", async () => {
    const a = discoveryCandidate(),
      b = discoveryCandidate(99000, "unit-b"),
      repo = repository(),
      log = logger();
    repo.upsert.mockRejectedValueOnce(new Error("SQL secret"));
    expect(
      await importNaverDiscovery(repo, log, [a, b], {
        ...discoveryOptions,
        verifications: [
          discoveryVerification(a),
          discoveryVerification(b, { sellerId: "unit-b" }),
        ],
      })
    ).toMatchObject({ failed: 1, matched: 1 });
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("SQL secret");
  });
});
