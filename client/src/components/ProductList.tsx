import type { Product } from "@/domain/product";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { getCategoryLabel } from "@/domain/category";
import {
  formatPrice,
  formatCurrentPrice,
  formatRate,
  PRICE_STATUS_LABELS,
} from "@/lib/productFormatting";
import { PriceRangeBar } from "./PriceRangeBar";

export function ProductList({
  products,
  offset = 0,
}: {
  products: Product[];
  offset?: number;
}) {
  return (
    <div className="ranking-list" data-ui>
      <div className="ranking-columns" aria-hidden="true">
        <span>순위 / 상품</span>
        <span>현재 가격</span>
        <span>6개월 변동폭</span>
        <span>현재 가격 위치</span>
        <span />
      </div>
      <ol start={offset + 1}>
        {products.map((product, index) => (
          <li key={product.id}>
            <Link
              href={`/products/${product.id}`}
              className="ranking-row"
              aria-label={`${offset + index + 1}위 ${product.displayName}, 현재 ${formatCurrentPrice(product)}, 6개월 변동폭 ${formatRate(product.priceRangeRate)}, ${PRICE_STATUS_LABELS[product.priceStatus]}, 상세보기`}
            >
              <div className="ranking-product">
                <span className="rank-number" data-top={offset + index < 3}>
                  {String(offset + index + 1).padStart(2, "0")}
                </span>
                <img
                  src={product.imageUrl}
                  alt=""
                  width="64"
                  height="64"
                  loading="lazy"
                />
                <div>
                  <span className="product-meta">
                    {getCategoryLabel(product.category)} ·{" "}
                    {product.manufacturer}
                  </span>
                  <h3>{product.modelName}</h3>
                </div>
              </div>
              <strong className="ranking-price">
                <span className="mobile-label">현재 가격</span>
                {formatCurrentPrice(product)}
              </strong>
              <div className="ranking-range">
                <strong>{formatRate(product.priceRangeRate)}</strong>
                <span>{formatPrice(product.priceRangeAmount)}</span>
              </div>
              <div className="ranking-position">
                <span
                  className="price-status"
                  data-status={product.priceStatus}
                >
                  {PRICE_STATUS_LABELS[product.priceStatus]}
                </span>
                <PriceRangeBar product={product} compact />
              </div>
              <ArrowUpRight
                size={19}
                className="ranking-arrow"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
