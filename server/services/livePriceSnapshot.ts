import type { LivePrices } from "../integrations/danawa/danawaLivePrices.js";
import { performance } from "node:perf_hooks";
import { collectionFailure } from "../domain/priceCollection";
import type { Logger } from "../logging/logger";
import {
  LivePriceStorageError,
  type PriceSaveOutcome,
} from "../repositories/livePriceSnapshotRepository";
import type {
  LivePriceSnapshotRepository,
  MissingHistoryProduct,
} from "../repositories/livePriceSnapshotRepository";

export class LivePriceExecutionError extends Error {
  readonly executionStatus = "FAILED" as const;
  constructor(
    message: string,
    public readonly stage: string,
    cause: unknown
  ) {
    super(message, { cause });
    this.name = "LivePriceExecutionError";
  }
}

export async function refreshLivePriceSnapshot(
  fetchPrices: () => Promise<LivePrices>,
  repository: LivePriceSnapshotRepository,
  logger: Logger,
  targetExternalIds?: string[]
) {
  const tracked =
    targetExternalIds?.length ?? (await repository.countMappedProducts());
  let live: LivePrices;
  try {
    live = await fetchPrices();
  } catch (error) {
    await repository.recordUnobserved(
      [],
      new Date().toISOString(),
      collectionFailure(error),
      targetExternalIds
    );
    throw error;
  }
  const { updated } = await repository.applyPrices(
    live.prices,
    live.checkedAt,
    live.details
  );
  let failed = 0;
  const handled = Array.from(live.prices.keys());
  for (const [externalId, reason] of Array.from(live.failures ?? [])) {
    if (targetExternalIds && !targetExternalIds.includes(externalId)) continue;
    const result = await repository.recordUnobserved(
      [],
      live.checkedAt,
      reason,
      [externalId]
    );
    failed += result.failed;
    handled.push(externalId);
  }
  const remainder = await repository.recordUnobserved(
    handled,
    live.checkedAt,
    "NOT_OBSERVED_IN_VALID_LIST",
    targetExternalIds
  );
  failed += remainder.failed;
  const summary = { tracked, fetched: live.prices.size, updated, failed };
  if (failed)
    logger.warn("Current prices not reconfirmed; previous values preserved", {
      ...summary,
    });
  logger.info("Live price snapshot refreshed", { ...summary });
  return summary;
}

// The initial mapping snapshot defines the scope of this run, even when discovery
// creates mappings while the external list and selected searches are running.
export async function refreshTrackedLivePriceSnapshot(
  fetchPrices: () => Promise<LivePrices>,
  fetchSelected: (products: MissingHistoryProduct[]) => Promise<LivePrices>,
  repository: LivePriceSnapshotRepository,
  logger: Logger,
  selectedTargets?:
    | MissingHistoryProduct[]
    | (() => Promise<MissingHistoryProduct[]>)
) {
  let stage = "READ_TRACKED";
  let completedOutcomes: PriceSaveOutcome[] = [];
  let trackedMapping = new Map<string, MissingHistoryProduct>();
  let statusTargets: MissingHistoryProduct[] = [];
  const startedAt = performance.now();
  const durationsMs: Record<string, number> = {
    trackedLookup: 0,
    listFetch: 0,
    selectedFetch: 0,
    listSave: 0,
    selectedSave: 0,
    unobservedStatus: 0,
  };
  const progress: Record<string, unknown> = {};
  async function timed<T>(name: string, action: () => Promise<T>): Promise<T> {
    const start = performance.now();
    let completed = false;
    try {
      logger.info("Live price refresh stage started", { stage: name });
    } catch {
      // A diagnostic log must not prevent the collection stage from running.
    }
    try {
      const result = await action();
      completed = true;
      return result;
    } finally {
      const durationMs = Math.round(performance.now() - start);
      durationsMs[name] += durationMs;
      logger.info("Live price refresh stage completed", {
        stage: name,
        durationMs,
        completed,
      });
    }
  }
  function timings() {
    return {
      ...durationsMs,
      priceSave: durationsMs.listSave + durationsMs.selectedSave,
      total: Math.round(performance.now() - startedAt),
    };
  }
  try {
    const tracked = await timed("trackedLookup", () =>
      typeof selectedTargets === "function"
        ? selectedTargets()
        : selectedTargets
          ? Promise.resolve(selectedTargets)
          : repository.findTrackedProducts()
    );
    progress.tracked = new Set(tracked.map(p => p.product_id)).size;
    progress.mappingRows = tracked.length;
    stage = "VALIDATE_TRACKED";
    if (!tracked.length) throw new Error("NO_TRACKED_PRODUCTS");
    const byExternal = new Map<string, MissingHistoryProduct>();
    trackedMapping = byExternal;
    const internalIds = new Set<string>();
    for (const product of tracked) {
      if (!product.product_id || !product.external_product_id)
        throw new Error("INVALID_DANAWA_MAPPING");
      if (
        byExternal.has(product.external_product_id) ||
        internalIds.has(product.product_id)
      ) {
        logger.error("Ambiguous Danawa product mapping", {
          externalProductId: product.external_product_id,
          productId: product.product_id,
        });
        throw new Error("AMBIGUOUS_DANAWA_MAPPING");
      }
      byExternal.set(product.external_product_id, product);
      internalIds.add(product.product_id);
    }

    let live: LivePrices;
    stage = "FETCH_LIST";
    try {
      live = await timed("listFetch", fetchPrices);
    } catch (error) {
      stage = "SAVE_FETCH_FAILURE_STATUS";
      statusTargets = tracked;
      await timed("unobservedStatus", () =>
        repository.recordUnobserved(
          [],
          new Date().toISOString(),
          collectionFailure(error),
          Array.from(byExternal.keys()),
          tracked
        )
      );
      stage = "FETCH_LIST";
      throw error;
    }
    const listFetchedExternalIds = live.prices.size;
    const targets = tracked.filter(
      product => !live.prices.has(product.external_product_id)
    );
    Object.assign(progress, {
      listFetchedExternalIds,
      trackedListObserved: tracked.length - targets.length,
      retryTargets: targets.length,
    });
    const listDiagnostics = live.listDiagnostics;
    const listReasons: Record<string, number> = {};
    for (const product of targets) {
      const id = product.external_product_id;
      const reason =
        listDiagnostics?.priceFailures.get(id) ??
        (listDiagnostics?.rejectedExternalIds.has(id)
          ? "UNUSABLE_LIST_ENTRY"
          : listDiagnostics?.listedIds.has(id)
            ? "OTHER_UNOBSERVED"
            : "NOT_OBSERVED_IN_VALID_LIST");
      listReasons[reason] = (listReasons[reason] ?? 0) + 1;
    }
    const expectedMappings = new Map(
      tracked.map(p => [p.external_product_id, p.product_id])
    );
    // Commit already confirmed list observations before the slower fallback.
    stage = "SAVE_LIST";
    const listApplied = await timed("listSave", () =>
      repository.applyPrices(
        live.prices,
        live.checkedAt,
        live.details,
        expectedMappings,
        { logger, batch: "listSave" }
      )
    );
    completedOutcomes = listApplied.outcomes;
    progress.listCommitted = listApplied.updated;
    const searchable = targets.filter(p => p.name?.trim());
    progress.searchableTargets = searchable.length;
    stage = "FETCH_SELECTED";
    const selected = searchable.length
      ? await timed("selectedFetch", () => fetchSelected(searchable))
      : ({
          prices: new Map<string, number>(),
          checkedAt: live.checkedAt,
        } as LivePrices);
    for (const product of targets.filter(p => !p.name?.trim())) {
      selected.failures ??= new Map();
      selected.failures.set(
        product.external_product_id,
        "PRODUCT_NAME_NOT_PROVIDED"
      );
    }
    for (const [externalProductId, durationMs] of Array.from(
      selected.selectedDurationsMs ?? []
    ))
      logger.info("Danawa selected price request completed", {
        externalProductId,
        durationMs,
        reason: selected.failures?.get(externalProductId) ?? "OBSERVED",
      });
    const retryPrices = new Map<string, number>();
    const targetIds = new Set(targets.map(p => p.external_product_id));
    for (const [id, price] of Array.from(selected.prices)) {
      if (!targetIds.has(id) || live.prices.has(id)) continue;
      live.prices.set(id, price);
      retryPrices.set(id, price);
      const detail = selected.details?.get(id);
      if (detail) {
        live.details ??= new Map();
        live.details.set(id, detail);
      }
    }
    stage = "SAVE_SELECTED";
    const retryApplied = retryPrices.size
      ? await timed("selectedSave", () =>
          repository.applyPrices(
            retryPrices,
            selected.checkedAt,
            live.details,
            expectedMappings,
            { logger, batch: "selectedSave" }
          )
        )
      : { updated: 0, outcomes: [], skipped: [] };
    completedOutcomes = [...completedOutcomes, ...retryApplied.outcomes];
    const failedProducts = targets.filter(
      p => !live.prices.has(p.external_product_id)
    );
    Object.assign(progress, {
      retryObserved: targets.length - failedProducts.length,
      failed: failedProducts.length,
    });
    const failureReasons: Record<string, number> = {};
    Object.assign(progress, { listReasons, failureReasons });
    const failuresByReason = new Map<string, MissingHistoryProduct[]>();
    for (const product of failedProducts) {
      const id = product.external_product_id;
      const reason = selected.failures?.get(id) ?? "OTHER_UNOBSERVED";
      failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
      const group = failuresByReason.get(reason) ?? [];
      group.push(product);
      failuresByReason.set(reason, group);
      logger.warn("Danawa selected current price unavailable", {
        productId: product.product_id,
        externalProductId: id,
        listReason:
          listDiagnostics?.priceFailures.get(id) ??
          (listDiagnostics?.rejectedExternalIds.has(id)
            ? "UNUSABLE_LIST_ENTRY"
            : listDiagnostics?.listedIds.has(id)
              ? "OTHER_UNOBSERVED"
              : "NOT_OBSERVED_IN_VALID_LIST"),
        ...selected.failureDetails?.get(id),
        reason,
      });
    }
    let recordedCandidates = 0;
    stage = "SAVE_FAILURE_STATUS";
    for (const [reason, products] of Array.from(failuresByReason)) {
      statusTargets = products;
      const result = await timed("unobservedStatus", () =>
        repository.recordUnobserved(
          [],
          selected.checkedAt,
          reason,
          products.map(p => p.external_product_id),
          products
        )
      );
      recordedCandidates += result.failed;
      if (result.matchedExternalIds) {
        const matched = new Set(result.matchedExternalIds);
        for (const product of products) {
          if (!matched.has(product.external_product_id))
            logger.warn("Danawa failure status mapping unavailable", {
              productId: product.product_id,
              externalProductId: product.external_product_id,
              reason: "MAPPING_NOT_FOUND_OR_CHANGED",
            });
        }
      }
    }
    const saveSkipReasons: Record<string, number> = {};
    for (const skip of [
      ...(listApplied.skipped ?? []),
      ...(retryApplied.skipped ?? []),
    ]) {
      saveSkipReasons[skip.reason] = (saveSkipReasons[skip.reason] ?? 0) + 1;
      logger.warn("Danawa observed price skipped", skip);
    }
    const trackedOutcomes = completedOutcomes.filter(
      outcome =>
        byExternal.has(outcome.externalId) &&
        (outcome.productId === byExternal.get(outcome.externalId)?.product_id ||
          (outcome.status === "SKIPPED" &&
            (outcome.reason === "MAPPING_NOT_FOUND" ||
              outcome.reason === "MAPPING_CHANGED")))
    );
    const committed = trackedOutcomes.filter(
      o =>
        o.status === "COMMITTED" &&
        o.productId === byExternal.get(o.externalId)?.product_id
    );
    const timeSkipped = trackedOutcomes.filter(
      o =>
        o.status === "SKIPPED" &&
        (o.reason === "SAME_OBSERVATION" || o.reason === "OLDER_OBSERVATION") &&
        o.productId === byExternal.get(o.externalId)?.product_id
    );
    const mappingSkipped = trackedOutcomes.filter(
      o =>
        o.status === "SKIPPED" &&
        (o.reason === "MAPPING_NOT_FOUND" || o.reason === "MAPPING_CHANGED")
    );
    const handledProducts = new Set(
      [...committed, ...timeSkipped].map(o => o.productId)
    );
    const fullyAccounted =
      handledProducts.size + failedProducts.length === internalIds.size;
    const executionStatus: LivePriceExecutionStatus =
      mappingSkipped.length ||
      recordedCandidates !== failedProducts.length ||
      !fullyAccounted ||
      failedProducts.length === internalIds.size
        ? "FAILED"
        : failedProducts.length === 0
          ? "SUCCESS"
          : committed.length > 0
            ? "PARTIAL_SUCCESS"
            : "FAILED";
    const summary = {
      executionStatus,
      tracked: internalIds.size,
      mappingRows: tracked.length,
      trackedExternalIds: byExternal.size,
      listedExternalIds: listDiagnostics
        ? new Set([
            ...Array.from(listDiagnostics.listedIds),
            ...Array.from(listDiagnostics.rejectedExternalIds),
          ]).size
        : listFetchedExternalIds,
      listFetchedExternalIds,
      trackedListObserved: tracked.length - targets.length,
      retryTargets: targets.length,
      searchableTargets: searchable.length,
      retryObserved: targets.length - failedProducts.length,
      fetched: live.prices.size,
      updated: listApplied.updated + retryApplied.updated,
      failed: failedProducts.length,
      committedProducts: committed.length,
      firstObservations: committed.filter(o => o.firstObservation).length,
      basePriceChanged: committed.filter(o => o.basePriceChanged === true)
        .length,
      basePriceUnchanged: committed.filter(o => o.basePriceChanged === false)
        .length,
      shippingKnowledgeChanged: committed.filter(
        o => o.shippingKnowledgeChanged
      ).length,
      timeSkippedProducts: timeSkipped.length,
      mappingSkippedProducts: mappingSkipped.length,
      storageFailures: 0,
      saveOutcomes: trackedOutcomes,
      recordedFailureCandidates: recordedCandidates,
      missingFailureMappings: failedProducts.length - recordedCandidates,
      listReasons,
      failureReasons,
      saveSkipReasons,
      rejectedListItems: listDiagnostics?.rejectedItems ?? 0,
      rejectedListExternalIds: Array.from(
        listDiagnostics?.rejectedExternalIds ?? []
      ),
      durationsMs: timings(),
      selectedRequestDurationsMs: Array.from(
        selected.selectedDurationsMs ?? [],
        ([externalProductId, durationMs]) => ({ externalProductId, durationMs })
      ),
    };
    if (summary.failed)
      logger.warn(
        "Current prices not reconfirmed; previous values preserved",
        summary
      );
    if (executionStatus === "FAILED")
      logger.error(
        "Live price snapshot refresh did not meet success conditions",
        summary
      );
    else if (executionStatus === "PARTIAL_SUCCESS")
      logger.warn("Live price snapshot refreshed", summary);
    else logger.info("Live price snapshot refreshed", summary);
    return summary;
  } catch (error) {
    const storageError =
      error instanceof LivePriceStorageError ? error : undefined;
    const isStorageStage = [
      "READ_TRACKED",
      "SAVE_LIST",
      "SAVE_SELECTED",
      "SAVE_FAILURE_STATUS",
      "SAVE_FETCH_FAILURE_STATUS",
    ].includes(stage);
    const committedBeforeFailure = [
      ...completedOutcomes,
      ...(storageError?.committedOutcomes ?? []),
    ].filter(o => o.status === "COMMITTED");
    const trackedCommittedBeforeFailure = committedBeforeFailure.filter(
      o =>
        o.productId &&
        trackedMapping.get(o.externalId)?.product_id === o.productId
    );
    logger.error("Live price snapshot refresh failed", {
      executionStatus: "FAILED",
      ...progress,
      committedProducts: trackedCommittedBeforeFailure.length,
      basePriceChanged: trackedCommittedBeforeFailure.filter(
        o => o.basePriceChanged === true
      ).length,
      basePriceUnchanged: trackedCommittedBeforeFailure.filter(
        o => o.basePriceChanged === false
      ).length,
      durationsMs: timings(),
      stage,
      exceptionType: error instanceof Error ? error.name : typeof error,
      errorCode: storageError
        ? storageError.failureType
        : isStorageStage
          ? "STORAGE_ERROR"
          : error instanceof Error &&
              [
                "NO_TRACKED_PRODUCTS",
                "INVALID_DANAWA_MAPPING",
                "AMBIGUOUS_DANAWA_MAPPING",
                "Danawa live list exceeded page limit",
              ].includes(error.message)
            ? error.message
            : collectionFailure(error),
      ...(typeof error === "object" &&
      error !== null &&
      "page" in error &&
      Number.isInteger(error.page)
        ? { page: error.page }
        : {}),
      ...(storageError
        ? {
            failureType: storageError.failureType,
            storageStage: storageError.stage,
            externalProductId: storageError.externalId,
            productId: storageError.productId,
            rollbackFailed: storageError.rollbackFailed,
            storageFailures:
              storageError.failureType === "STORAGE_ERROR" ? 1 : 0,
            committedBeforeFailure,
          }
        : {
            ...(isStorageStage
              ? {
                  failureType: "STORAGE_ERROR",
                  storageFailures: 1,
                  affectedProducts: statusTargets.map(p => ({
                    externalProductId: p.external_product_id,
                    productId: p.product_id,
                  })),
                }
              : {}),
            committedBeforeFailure,
          }),
    });
    if (error instanceof LivePriceStorageError) throw error;
    throw new LivePriceExecutionError(
      error instanceof Error ? error.message : "UNKNOWN_ERROR",
      stage,
      error
    );
  }
}

export type LivePriceExecutionStatus = "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
export function livePriceExitCode(status: LivePriceExecutionStatus): number {
  return status === "FAILED" ? 2 : 0;
}
