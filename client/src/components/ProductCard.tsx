import type { Product } from "@/domain/product";
import { getCategoryLabel } from "@/domain/category";
import {
  formatPrice,
  formatRate,
  getNearLowestMessage,
  PRICE_STATUS_LABELS,
} from "@/lib/productFormatting";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { PriceRangeBar } from "./PriceRangeBar";

export function ProductCard({
  product,
  rank,
  showRangeAmount = false,
}: {
  product: Product;
  rank?: number;
  showRangeAmount?: boolean;
}) {
  const nearLowestMessage = getNearLowestMessage(product);

  return (
    <article className="product-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {rank !== undefined && (
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--orange-soft)] text-sm font-bold text-[var(--orange-strong)]">
              {rank}
            </span>
          )}
          <span className="rounded-full bg-[var(--sky-blue-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--sky-blue-strong)]">
            {getCategoryLabel(product.category)}
          </span>
        </div>
        <span className="price-status" data-status={product.priceStatus}>
          {PRICE_STATUS_LABELS[product.priceStatus]}
        </span>
      </div>

      <div className="mt-4 flex gap-4">
        <div className="product-card__image">
          <img
            src={product.imageUrl}
            alt={`${product.displayName} 대표 이미지`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            {product.manufacturer}
          </p>
          <h3 className="mt-1 line-clamp-2 font-semibold leading-snug text-[var(--text-primary)]">
            {product.modelName}
          </h3>
          <p className="mt-3 text-xs text-[var(--text-secondary)]">현재 가격</p>
          <p className="whitespace-nowrap text-xl font-bold text-[var(--text-primary)]">
            {formatPrice(product.currentPrice)}
          </p>
        </div>
      </div>

      {showRangeAmount && (
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-[var(--surface-muted)] p-3 text-sm">
          <div>
            <span className="block text-xs text-[var(--text-muted)]">
              가격 변동폭
            </span>
            <strong className="text-[var(--text-primary)]">
              {formatPrice(product.priceRangeAmount)}
            </strong>
          </div>
          <div>
            <span className="block text-xs text-[var(--text-muted)]">
              범위 대비
            </span>
            <strong className="text-[var(--orange-strong)]">
              {formatRate(product.priceRangeRate)}
            </strong>
          </div>
        </div>
      )}

      <div className="mt-4">
        <PriceRangeBar product={product} compact />
      </div>

      {nearLowestMessage && (
        <p className="mt-3 rounded-md bg-[var(--sky-blue-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
          {nearLowestMessage}
        </p>
      )}

      <Link
        href={`/products/${product.id}`}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--orange-strong)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sky-blue)]"
      >
        상세보기 <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}
