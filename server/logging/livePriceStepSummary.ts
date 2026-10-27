import { appendFile } from "node:fs/promises";
import type { Logger } from "./logger";

// Only known numeric metrics and controlled diagnostic codes reach Actions.
export function formatLivePriceStepSummary(
  report: Record<string, unknown>
): string {
  const status = ["SUCCESS", "PARTIAL_SUCCESS", "FAILED"].includes(
    String(report.executionStatus)
  )
    ? String(report.executionStatus)
    : "FAILED";
  const number = (name: string) =>
    typeof report[name] === "number" && Number.isFinite(report[name])
      ? String(report[name])
      : "—";
  const code = (value: unknown) =>
    typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value) ? value : "—";
  const rows: [string, string][] = [
    ["상태", status],
    ["추적 상품", number("tracked")],
    ["매핑 행", number("mappingRows")],
    ["목록 유효 가격 외부 ID", number("listFetchedExternalIds")],
    ["목록 미관측 / 재조회 대상", number("retryTargets")],
    ["개별 검색 요청 대상", number("searchableTargets")],
    ["재조회 관측 성공", number("retryObserved")],
    ["최종 미관측 상품", number("failed")],
    ["추적 상품 저장 커밋", number("committedProducts")],
    ["실제 저장 장애", number("storageFailures")],
    ["기본가 변경", number("basePriceChanged")],
    ["기본가 유지", number("basePriceUnchanged")],
    ["정상 시각 skip", number("timeSkippedProducts")],
    ["실패 단계", code(report.storageStage ?? report.stage)],
    ["실패 유형", code(report.failureType ?? report.errorCode)],
    ["실패 페이지", number("page")],
    ["외부 상품 ID", code(report.externalProductId)],
    ["내부 상품 ID", code(report.productId)],
  ];
  const durations =
    typeof report.durationsMs === "object" && report.durationsMs !== null
      ? (report.durationsMs as Record<string, unknown>)
      : {};
  const lines = [
    "## DANAWA 현재가 수집",
    "",
    "| 항목 | 값 |",
    "| --- | ---: |",
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
    "",
    "### 단계별 소요 시간 (ms)",
    "",
    "| 단계 | 시간 |",
    "| --- | ---: |",
  ];
  for (const key of [
    "trackedLookup",
    "listFetch",
    "listSave",
    "selectedFetch",
    "selectedSave",
    "priceSave",
    "unobservedStatus",
    "total",
    "processTotal",
  ]) {
    const value = durations[key];
    lines.push(
      `| ${key} | ${typeof value === "number" && Number.isFinite(value) ? value : "—"} |`
    );
  }
  for (const key of ["listReasons", "failureReasons", "saveSkipReasons"]) {
    const reasons = report[key];
    if (!reasons || typeof reasons !== "object" || Array.isArray(reasons))
      continue;
    lines.push("", `### ${key}`, "", "| 원인 | 건수 |", "| --- | ---: |");
    for (const [reason, count] of Object.entries(reasons)) {
      if (
        /^[A-Z0-9_]+$/.test(reason) &&
        typeof count === "number" &&
        Number.isFinite(count)
      )
        lines.push(`| ${reason} | ${count} |`);
    }
  }
  return lines.join("\n") + "\n";
}

export async function writeLivePriceStepSummary(
  path: string | undefined,
  report: Record<string, unknown>,
  logger: Logger
): Promise<void> {
  if (!path) return;
  try {
    await appendFile(path, formatLivePriceStepSummary(report), "utf8");
  } catch {
    logger.warn("Live price Actions summary could not be written", {
      executionStatus: report.executionStatus,
    });
  }
}
