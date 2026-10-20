import type { Product } from "../client/src/domain/product";

// Keep a gap for a quarantined month rather than drawing an invented price or
// connecting through it. Excluded raw prices are never sent to the browser.
export function buildPriceChartData(product: Product) {
  const excluded = new Set(product.excludedHistoryMonths ?? []);
  const data: { date: string; price: number | null }[] = product.priceHistory
    .filter(point => !excluded.has(point.date.slice(0, 7)))
    .map(point => ({ date: point.date.slice(0, 7), price: point.price }));
  excluded.forEach(date => data.push({ date, price: null }));
  for (const point of product.observedPriceHistory ?? [])
    data.push({ ...point });
  if (product.currentPrice !== null && product.currentPriceMonth) {
    const date =
      product.observedPriceHistory?.length && product.currentPriceCheckedAt
        ? product.currentPriceCheckedAt
        : product.currentPriceMonth;
    if (
      !data.some(
        point =>
          point.price === product.currentPrice &&
          point.date.length > 7 &&
          date.length > 7 &&
          Date.parse(point.date) === Date.parse(date)
      )
    )
      data.push({ date, price: product.currentPrice });
  }
  return data.sort((a, b) =>
    a.date.length > 7 && b.date.length > 7
      ? Date.parse(a.date) - Date.parse(b.date)
      : a.date.localeCompare(b.date)
  );
}
