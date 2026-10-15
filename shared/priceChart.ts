import type { Product } from "../client/src/domain/product";

// Keep a gap for a quarantined month rather than drawing an invented price or
// connecting through it. Excluded raw prices are never sent to the browser.
export function buildPriceChartData(product: Product) {
  const excluded = new Set(product.excludedHistoryMonths ?? []);
  const data: { date: string; price: number | null }[] = product.priceHistory
    .filter(point => !excluded.has(point.date.slice(0, 7)))
    .map(point => ({ date: point.date.slice(0, 7), price: point.price }));
  excluded.forEach(date => data.push({ date, price: null }));
  if (product.currentPrice !== null && product.currentPriceMonth) {
    data.push({ date: product.currentPriceMonth, price: product.currentPrice });
  }
  return data.sort((a, b) => a.date.localeCompare(b.date));
}
