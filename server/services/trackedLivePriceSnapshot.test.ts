import { describe, expect, it, vi } from "vitest";
import {
  livePriceExitCode,
  refreshTrackedLivePriceSnapshot,
} from "./livePriceSnapshot";
import { LivePriceStorageError } from "../repositories/livePriceSnapshotRepository";
import type {
  LivePriceSnapshotRepository,
  MissingHistoryProduct,
} from "../repositories/livePriceSnapshotRepository";

const at = "2026-10-27T00:00:00.000Z";
const products: MissingHistoryProduct[] = [
  { product_id: "a", external_product_id: "1", name: "GPU A" },
  { product_id: "b", external_product_id: "2", name: "GPU B" },
  { product_id: "c", external_product_id: "3", name: "GPU C" },
];
function setup(rows = products) {
  const writes: string[][] = [];
  const repository: LivePriceSnapshotRepository = {
    countMappedProducts: vi.fn(),
    findProductsWithoutHistory: vi.fn(),
    findTrackedProducts: vi.fn(async () => rows),
    applyPrices: vi.fn(async (prices, _checkedAt, _details, expected) => {
      writes.push(Array.from(prices.keys()));
      const outcomes = Array.from(prices.keys()).map(externalId => {
        const productId = expected?.get(externalId);
        return productId
          ? {
              externalId,
              productId,
              status: "COMMITTED" as const,
              basePriceChanged: false,
            }
          : {
              externalId,
              status: "SKIPPED" as const,
              reason: "MAPPING_NOT_FOUND" as const,
            };
      });
      return {
        updated: outcomes.filter(o => o.status === "COMMITTED").length,
        outcomes,
      };
    }),
    recordUnobserved: vi.fn(async (_present, _at, _reason, ids) => ({
      failed: ids?.length ?? 0,
    })),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { repository, logger, writes };
}

describe("tracked live price refresh", () => {
  it("returns success for all committed tracked products", async () => {
    const { repository, logger } = setup(products.slice(0, 2));
    const result = await refreshTrackedLivePriceSnapshot(
      async () => ({
        checkedAt: at,
        prices: new Map([
          ["1", 100],
          ["2", 200],
        ]),
      }),
      vi.fn(),
      repository,
      logger
    );
    expect(result).toMatchObject({
      executionStatus: "SUCCESS",
      committedProducts: 2,
      basePriceUnchanged: 2,
      failed: 0,
    });
  });
  it("fails when a tracked observed price has no matching mapping", async () => {
    const { repository, logger } = setup([products[0]]);
    vi.mocked(repository.applyPrices).mockResolvedValue({
      updated: 0,
      outcomes: [
        { externalId: "1", status: "SKIPPED", reason: "MAPPING_NOT_FOUND" },
      ],
      skipped: [{ externalId: "1", reason: "MAPPING_NOT_FOUND" }],
    });
    const result = await refreshTrackedLivePriceSnapshot(
      async () => ({ checkedAt: at, prices: new Map([["1", 100]]) }),
      vi.fn(),
      repository,
      logger
    );
    expect(result).toMatchObject({
      executionStatus: "FAILED",
      committedProducts: 0,
      mappingSkippedProducts: 1,
      failed: 0,
    });
  });
  it("returns FAILED when every tracked product remains unobserved", async () => {
    const { repository, logger } = setup(products.slice(0, 2));
    const result = await refreshTrackedLivePriceSnapshot(
      async () => ({ checkedAt: at, prices: new Map() }),
      async () => ({
        checkedAt: at,
        prices: new Map(),
        failures: new Map([
          ["1", "PRODUCT_ID_NOT_FOUND"],
          ["2", "HTTP"],
        ]),
      }),
      repository,
      logger
    );
    expect(result).toMatchObject({
      executionStatus: "FAILED",
      failed: 2,
      committedProducts: 0,
      failureReasons: { PRODUCT_ID_NOT_FOUND: 1, HTTP: 1 },
    });
    expect(logger.error).toHaveBeenCalledWith(
      "Live price snapshot refresh did not meet success conditions",
      expect.objectContaining({ executionStatus: "FAILED" })
    );
  });
  it("reports a failure to save collection status separately from unobserved prices", async () => {
    const { repository, logger } = setup([products[0]]);
    vi.mocked(repository.recordUnobserved).mockRejectedValue(
      new Error("status DB failure")
    );
    await expect(
      refreshTrackedLivePriceSnapshot(
        async () => ({ checkedAt: at, prices: new Map() }),
        async () => ({ checkedAt: at, prices: new Map() }),
        repository,
        logger
      )
    ).rejects.toMatchObject({
      executionStatus: "FAILED",
      stage: "SAVE_FAILURE_STATUS",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "Live price snapshot refresh failed",
      expect.objectContaining({
        executionStatus: "FAILED",
        failureType: "STORAGE_ERROR",
        storageFailures: 1,
        affectedProducts: [{ externalProductId: "1", productId: "a" }],
      })
    );
  });
  it("does not treat commits for non-target products as partial success", async () => {
    const { repository, logger } = setup([products[0]]);
    vi.mocked(repository.applyPrices).mockResolvedValue({
      updated: 1,
      outcomes: [
        { externalId: "other", productId: "other", status: "COMMITTED" },
      ],
    });
    const result = await refreshTrackedLivePriceSnapshot(
      async () => ({ checkedAt: at, prices: new Map([["other", 100]]) }),
      async () => ({
        checkedAt: at,
        prices: new Map(),
        failures: new Map([["1", "PRODUCT_ID_NOT_FOUND"]]),
      }),
      repository,
      logger
    );
    expect(result).toMatchObject({
      executionStatus: "FAILED",
      committedProducts: 0,
      updated: 1,
      failed: 1,
    });
  });
  it("fails rather than declaring partial success when only time skips and missing products remain", async () => {
    const { repository, logger } = setup(products.slice(0, 2));
    vi.mocked(repository.applyPrices).mockResolvedValue({
      updated: 0,
      outcomes: [
        {
          externalId: "1",
          productId: "a",
          status: "SKIPPED",
          reason: "SAME_OBSERVATION",
        },
      ],
    });
    const result = await refreshTrackedLivePriceSnapshot(
      async () => ({ checkedAt: at, prices: new Map([["1", 100]]) }),
      async () => ({ checkedAt: at, prices: new Map() }),
      repository,
      logger
    );
    expect(result).toMatchObject({
      executionStatus: "FAILED",
      timeSkippedProducts: 1,
      failed: 1,
    });
  });
  it("logs failed storage with stage, product and prior commits then propagates it", async () => {
    const { repository, logger } = setup(products.slice(0, 2));
    const error = new LivePriceStorageError(
      "write failure",
      "2",
      "b",
      "UPDATE_CURRENT_PRICE",
      "STORAGE_ERROR",
      [{ externalId: "1", productId: "a", status: "COMMITTED" }],
      new Error("db")
    );
    vi.mocked(repository.applyPrices).mockRejectedValue(error);
    await expect(
      refreshTrackedLivePriceSnapshot(
        async () => ({
          checkedAt: at,
          prices: new Map([
            ["1", 100],
            ["2", 200],
          ]),
        }),
        vi.fn(),
        repository,
        logger
      )
    ).rejects.toBe(error);
    expect(repository.recordUnobserved).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Live price snapshot refresh failed",
      expect.objectContaining({
        executionStatus: "FAILED",
        storageFailures: 1,
        storageStage: "UPDATE_CURRENT_PRICE",
        externalProductId: "2",
        productId: "b",
        committedBeforeFailure: [expect.objectContaining({ productId: "a" })],
      })
    );
  });
  it("fails explicitly when no tracked targets exist", async () => {
    const { repository, logger } = setup([]);
    const fetch = vi.fn();
    await expect(
      refreshTrackedLivePriceSnapshot(fetch, fetch, repository, logger)
    ).rejects.toThrow("NO_TRACKED_PRODUCTS");
    expect(fetch).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Live price snapshot refresh failed",
      expect.objectContaining({
        executionStatus: "FAILED",
        errorCode: "NO_TRACKED_PRODUCTS",
      })
    );
  });
  it("maps status to process exit without collapsing partial success", () => {
    expect(livePriceExitCode("SUCCESS")).toBe(0);
    expect(livePriceExitCode("PARTIAL_SUCCESS")).toBe(0);
    expect(livePriceExitCode("FAILED")).not.toBe(0);
  });
  it("commits list observations before searching only missing tracked IDs and reports distinct counts", async () => {
    const { repository, logger, writes } = setup();
    const fetchSelected = vi.fn(async (targets: MissingHistoryProduct[]) => {
      expect(writes).toEqual([["1", "unmapped"]]);
      expect(targets.map(p => p.external_product_id)).toEqual(["2", "3"]);
      return {
        checkedAt: at,
        prices: new Map([
          ["2", 200],
          ["wrong", 999],
        ]),
        details: new Map([["2", { observedAt: at, shippingFee: null }]]),
        failures: new Map([["3", "PRODUCT_ID_NOT_FOUND"]]),
      };
    });
    const summary = await refreshTrackedLivePriceSnapshot(
      async () => ({
        checkedAt: at,
        prices: new Map([
          ["1", 100],
          ["unmapped", 300],
        ]),
        listDiagnostics: {
          listedIds: new Set(["1", "3", "unmapped"]),
          priceFailures: new Map([["3", "INVALID_CURRENT_PRICE"]]),
          rejectedItems: 1,
          rejectedExternalIds: new Set(["4"]),
        },
      }),
      fetchSelected,
      repository,
      logger
    );
    expect(writes).toEqual([["1", "unmapped"], ["2"]]);
    expect(summary).toMatchObject({
      tracked: 3,
      mappingRows: 3,
      trackedExternalIds: 3,
      listedExternalIds: 4,
      listFetchedExternalIds: 2,
      trackedListObserved: 1,
      retryTargets: 2,
      retryObserved: 1,
      fetched: 3,
      updated: 2,
      executionStatus: "PARTIAL_SUCCESS",
      failed: 1,
      rejectedListItems: 1,
      listReasons: { NOT_OBSERVED_IN_VALID_LIST: 1, INVALID_CURRENT_PRICE: 1 },
      failureReasons: { PRODUCT_ID_NOT_FOUND: 1 },
      durationsMs: expect.objectContaining({
        trackedLookup: expect.any(Number),
        listFetch: expect.any(Number),
        selectedFetch: expect.any(Number),
        priceSave: expect.any(Number),
        unobservedStatus: expect.any(Number),
        total: expect.any(Number),
      }),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Live price snapshot refreshed",
      expect.objectContaining({ executionStatus: "PARTIAL_SUCCESS" })
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Live price refresh stage completed",
      expect.objectContaining({
        stage: "selectedFetch",
        durationMs: expect.any(Number),
        completed: true,
      })
    );
    expect(repository.recordUnobserved).toHaveBeenCalledWith(
      [],
      at,
      "PRODUCT_ID_NOT_FOUND",
      ["3"],
      [products[2]]
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "Danawa selected current price unavailable",
      expect.objectContaining({
        externalProductId: "3",
        listReason: "INVALID_CURRENT_PRICE",
      })
    );
  });

  it.each([
    [products[0], { ...products[1], external_product_id: "1" }],
    [products[0], { ...products[1], product_id: "a" }],
  ])(
    "rejects ambiguous mappings before fetching or writing",
    async (...rows) => {
      const { repository, logger } = setup(rows);
      const fetch = vi.fn();
      await expect(
        refreshTrackedLivePriceSnapshot(fetch, fetch, repository, logger)
      ).rejects.toThrow("AMBIGUOUS_DANAWA_MAPPING");
      expect(fetch).not.toHaveBeenCalled();
      expect(repository.applyPrices).not.toHaveBeenCalled();
    }
  );

  it("fails the whole run on a list error and records only the initial targets", async () => {
    const { repository, logger } = setup();
    const selected = vi.fn();
    await expect(
      refreshTrackedLivePriceSnapshot(
        async () => {
          throw new Error("network");
        },
        selected,
        repository,
        logger
      )
    ).rejects.toThrow("network");
    expect(selected).not.toHaveBeenCalled();
    expect(repository.applyPrices).not.toHaveBeenCalled();
    expect(repository.recordUnobserved).toHaveBeenCalledWith(
      [],
      expect.any(String),
      "NETWORK_OR_RESPONSE",
      ["1", "2", "3"],
      products
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Live price refresh stage completed",
      expect.objectContaining({
        stage: "listFetch",
        completed: false,
        durationMs: expect.any(Number),
      })
    );
    expect(logger.error).toHaveBeenCalledWith(
      "Live price snapshot refresh failed",
      expect.objectContaining({
        executionStatus: "FAILED",
        stage: "FETCH_LIST",
        durationsMs: expect.objectContaining({
          total: expect.any(Number),
          listFetch: expect.any(Number),
        }),
      })
    );
  });

  it("keeps save skips separate from final unobserved failures", async () => {
    const { repository, logger } = setup([products[0]]);
    vi.mocked(repository.applyPrices).mockResolvedValue({
      updated: 0,
      outcomes: [
        {
          externalId: "1",
          productId: "a",
          status: "SKIPPED",
          reason: "OLDER_OBSERVATION",
        },
      ],
      skipped: [
        { externalId: "1", productId: "a", reason: "OLDER_OBSERVATION" },
      ],
    });
    const summary = await refreshTrackedLivePriceSnapshot(
      async () => ({ checkedAt: at, prices: new Map([["1", 100]]) }),
      vi.fn(),
      repository,
      logger
    );
    expect(summary).toMatchObject({
      failed: 0,
      updated: 0,
      saveSkipReasons: { OLDER_OBSERVATION: 1 },
      retryTargets: 0,
      executionStatus: "SUCCESS",
    });
    expect(repository.recordUnobserved).not.toHaveBeenCalled();
  });
  it("preserves an unnamed product as unobserved without sending an unfiltered search", async () => {
    const { repository, logger } = setup([{ ...products[0], name: "" }]);
    const selected = vi.fn();
    const summary = await refreshTrackedLivePriceSnapshot(
      async () => ({ checkedAt: at, prices: new Map() }),
      selected,
      repository,
      logger
    );
    expect(selected).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      failed: 1,
      failureReasons: { PRODUCT_NAME_NOT_PROVIDED: 1 },
      executionStatus: "FAILED",
    });
    expect(repository.recordUnobserved).toHaveBeenCalledWith(
      [],
      at,
      "PRODUCT_NAME_NOT_PROVIDED",
      ["1"],
      expect.any(Array)
    );
  });
});
