import { performance } from "node:perf_hooks";
import type { Logger } from "../logging/logger";
import type { PriceSaveOutcome } from "./livePriceSnapshotRepository";

// These logs describe acknowledged commits, not a durable audit or proof that
// an in-flight COMMIT did not reach the server before a forced termination.
export class LivePriceStorageDiagnostics {
  private readonly startedAt: number;
  private stageStartedAt: number;
  private productStartedAt: number;
  private externalId?: string;
  private productId?: string;
  private stage?: string;
  private processed = 0;
  private committed = 0;
  private skipped = 0;
  private pending: {
    externalId: string;
    productId?: string;
    status: string;
    reason?: string;
  }[] = [];
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly logger: Logger,
    private readonly batch: string,
    private readonly total: number,
    private readonly now: () => number = () => performance.now()
  ) {
    this.startedAt = this.now();
    this.stageStartedAt = this.startedAt;
    this.productStartedAt = this.startedAt;
    this.timer = setInterval(() => {
      this.flush();
      if (this.stage && this.externalId)
        this.log("warn", "Live price storage operation still running", {
          batch: this.batch,
          externalId: this.externalId,
          productId: this.productId,
          stage: this.stage,
          durationMs: Math.round(this.now() - this.stageStartedAt),
          processed: this.processed,
          committed: this.committed,
          skipped: this.skipped,
          total: this.total,
        });
    }, 10_000);
    this.timer.unref();
  }

  startProduct(externalId: string) {
    this.productStartedAt = this.now();
    this.externalId = externalId;
    this.productId = undefined;
    this.stage = undefined;
  }

  setProductId(productId: string | undefined) {
    this.productId = productId;
  }

  startStage(stage: string) {
    this.finishStage();
    this.stage = stage;
    this.stageStartedAt = this.now();
  }

  finishStage() {
    if (!this.stage) return;
    const durationMs = Math.round(this.now() - this.stageStartedAt);
    if (durationMs >= 2_000)
      this.log("warn", "Slow live price storage operation", {
        batch: this.batch,
        externalId: this.externalId,
        productId: this.productId,
        stage: this.stage,
        durationMs,
      });
    this.stage = undefined;
  }

  finishProduct() {
    const durationMs = Math.round(this.now() - this.productStartedAt);
    if (durationMs >= 2_000)
      this.log("warn", "Slow live price product transaction", {
        batch: this.batch,
        externalId: this.externalId,
        productId: this.productId,
        durationMs,
      });
  }

  completed(outcome: PriceSaveOutcome) {
    this.processed++;
    if (outcome.status === "COMMITTED") this.committed++;
    else this.skipped++;
    this.pending.push({
      externalId: outcome.externalId,
      productId: outcome.productId,
      status: outcome.status,
      reason: outcome.reason,
    });
    if (this.pending.length >= 25) this.flush();
  }

  private flush() {
    if (!this.pending.length) return;
    this.log("info", "Live price storage progress", {
      batch: this.batch,
      processed: this.processed,
      committed: this.committed,
      skipped: this.skipped,
      total: this.total,
      elapsedMs: Math.round(this.now() - this.startedAt),
      confirmedOutcomes: this.pending,
    });
    this.pending = [];
  }

  close() {
    this.finishStage();
    clearInterval(this.timer);
    this.flush();
  }

  private log(
    level: "info" | "warn",
    message: string,
    context: Record<string, unknown>
  ) {
    try {
      this.logger[level](message, context);
    } catch {
      /* Diagnostics must not interrupt a transaction. */
    }
  }
}
