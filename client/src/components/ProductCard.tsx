import type { Product } from "@/domain/product";
import { getCategoryLabel } from "@/domain/category";
import {
  formatPrice,
  formatCurrentPrice,
  formatRate,
  getNearLowestMessage,
  PRICE_STATUS_LABELS,
} from "@/lib/productFormatting";
import { ArrowUpRight } from "lucide-react";
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
  const message = getNearLowestMessage(product);
  return (
    <article className="product-card">
      <div className="card-topline">
        <span>
          {rank !== undefined && <b className="card-rank">{rank}</b>}
          {getCategoryLabel(product.category)}
        </span>
        <span className="price-status" data-status={product.priceStatus}>
          {PRICE_STATUS_LABELS[product.priceStatus]}
        </span>
      </div>
      <Link href={`/products/${product.id}`} className="card-product-link">
        <div className="product-card__image">
          <img
            src={product.imageUrl}
            alt={`${product.displayName} 대표 이미지`}
            loading="lazy"
            width="240"
            height="160"
          />
        </div>
        <span className="product-meta">{product.manufacturer}</span>
        <h3>{product.modelName}</h3>
      </Link>
      <div className="card-price">
        <span>
          {product.currentPriceSource && product.currentPriceSource !== "DANAWA"
            ? "배송비 포함 최저가"
            : "현재 참고가"}
        </span>
        <strong>{formatCurrentPrice(product)}</strong>
      </div>
      {showRangeAmount && (
        <div className="card-range">
          <span>
            {product.analysis?.rankingPeriod === "UNDER_SIX_MONTHS"
              ? "관측 기간 변동폭"
              : "6개월 변동폭"}
          </span>
          <strong>
            {formatRate(product.priceRangeRate)}{" "}
            <small>
              {product.priceRangeAmount === null
                ? "데이터 부족"
                : formatPrice(product.priceRangeAmount)}
            </small>
          </strong>
        </div>
      )}
      <PriceRangeBar product={product} compact />
      {message && <p className="card-message">{message}</p>}
      <Link className="card-detail" href={`/products/${product.id}`}>
        가격 흐름 살펴보기 <ArrowUpRight size={17} aria-hidden="true" />
      </Link>
    </article>
  );
}
