import type { Product } from "@/domain/product";
import { formatPrice } from "@/lib/productFormatting";

interface PriceRangeBarProps {
  product: Product;
  compact?: boolean;
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function PriceRangeBar({
  product,
  compact = false,
}: PriceRangeBarProps) {
  const range = Math.max(
    1,
    product.sixMonthHighPrice - product.sixMonthLowPrice
  );
  const markerPosition = clamp(product.currentPositionRate);
  const fairStart = clamp(
    ((product.fairPriceMin - product.sixMonthLowPrice) / range) * 100
  );
  const fairEnd = clamp(
    ((product.fairPriceMax - product.sixMonthLowPrice) / range) * 100
  );

  return (
    <div
      className="price-range"
      aria-label={`가격 범위: 최저 ${formatPrice(product.sixMonthLowPrice)}, 현재 ${formatPrice(product.currentPrice)}, 최고 ${formatPrice(product.sixMonthHighPrice)}`}
    >
      <div className="price-range__track" aria-hidden="true">
        <span
          className="price-range__fair"
          style={{ left: `${fairStart}%`, width: `${fairEnd - fairStart}%` }}
        />
        <span
          className="price-range__marker"
          style={{ left: `${markerPosition}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
        <span className="whitespace-nowrap">
          {compact ? "낮은 구간" : formatPrice(product.sixMonthLowPrice)}
        </span>
        {!compact && <span className="whitespace-nowrap">적정 가격 구간</span>}
        <span className="whitespace-nowrap">
          {compact ? "높은 구간" : formatPrice(product.sixMonthHighPrice)}
        </span>
      </div>
    </div>
  );
}
