import type {
  Product,
  PriceSummary,
  FairPriceRange,
} from "../client/src/domain/product";

type AnalyzedProduct = Product & {
  [K in keyof PriceSummary | keyof FairPriceRange]: number;
};
export function hasPriceAnalysis(product: Product): product is AnalyzedProduct {
  return (
    (!product.analysis ||
      (product.analysis.comparable &&
        product.analysis.observationCount >= 2)) &&
    product.priceRangeAmount !== null &&
    Number.isFinite(product.priceRangeAmount) &&
    product.priceRangeRate !== null &&
    Number.isFinite(product.priceRangeRate) &&
    product.sixMonthLowPrice !== null &&
    product.sixMonthLowPrice > 0 &&
    product.sixMonthHighPrice !== null &&
    product.sixMonthAveragePrice !== null &&
    product.fairPriceMin !== null &&
    product.fairPriceMax !== null
  );
}

export function formatObservationPeriod(product: Product): string | null {
  const evidence = product.analysis;
  if (!evidence) return null;
  const periods: string[] = [];
  if (evidence.firstHistoryMonth && evidence.lastHistoryMonth) {
    periods.push(
      `${evidence.firstHistoryMonth} ~ ${evidence.lastHistoryMonth} · ${evidence.monthlyCount}개 월 이력`
    );
  }
  if (evidence.firstObservedAt && evidence.lastObservedAt) {
    const format = (value: string) =>
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(value));
    periods.push(
      `${format(evidence.firstObservedAt)} ~ ${format(evidence.lastObservedAt)} KST`
    );
  }
  return periods.length ? periods.join(" / ") : null;
}
