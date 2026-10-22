import type { Product } from "../client/src/domain/product";

export interface ProductNewsItem {
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
}

// Compare only consecutive, reviewed monthly observations from the same source.
// Retail snapshots and monthly Danawa minima have different price bases.
export function getLargestMonthlyChange(product: Product) {
  const excluded = new Set(product.excludedHistoryMonths ?? []);
  const points = product.priceHistory
    .filter(
      p =>
        /^\d{4}-\d{2}$/.test(p.date) &&
        !excluded.has(p.date) &&
        Number.isFinite(p.price) &&
        p.price > 0
    )
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const monthIndex = (date: string) =>
    Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
  let largest: {
    from: string;
    to: string;
    before: number;
    after: number;
    rate: number;
  } | null = null;
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1],
      after = points[i];
    if (monthIndex(after.date) - monthIndex(before.date) !== 1) continue;
    const rate = ((after.price - before.price) / before.price) * 100;
    if (!largest || Math.abs(rate) >= Math.abs(largest.rate)) {
      largest = {
        from: before.date,
        to: after.date,
        before: before.price,
        after: after.price,
        rate,
      };
    }
  }
  return largest;
}
