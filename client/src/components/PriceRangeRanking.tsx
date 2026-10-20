import type { Product } from "@/domain/product";
import { ProductList } from "./ProductList";
import {
  getCategoryLabel,
  VISIBLE_PRODUCT_CATEGORIES,
  type ProductCategory,
} from "@/domain/category";
import { useProductPage } from "@/hooks/useProductPage";
import { ProductLoadState } from "./ProductLoadState";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { hasPriceAnalysis } from "@shared/priceAnalysis";

export function PriceRangeRanking({
  products,
  period = "six-months",
  loading = false,
  error = null,
}: {
  products: Product[];
  period?: "six-months" | "under-six-months";
  loading?: boolean;
  error?: string | null;
}) {
  const short = period === "under-six-months";
  const [category, setCategory] = useState<ProductCategory | "ALL">("ALL");
  const scoped = useProductPage(
    `view=rankings&period=${period}&category=${category === "ALL" ? "" : category}`,
    category !== "ALL" || short
  );
  const visible = (
    category === "ALL" && !short ? products : scoped.data.products
  ).filter(
    product =>
      hasPriceAnalysis(product) &&
      product.analysis?.rankingPeriod ===
        (short ? "UNDER_SIX_MONTHS" : "SIX_MONTHS")
  );
  return (
    <section
      className="discovery-section"
      id={short ? "short-price-rankings" : "price-rankings"}
    >
      <div className="container">
        <div className="section-heading">
          <div>
            <h2>
              {short ? "6개월 미만 상품 순위" : "6개월 가격 변동폭 TOP 10"}
            </h2>
            <p>
              {short
                ? "실제 확보된 관측 기간의 가격 변동폭입니다."
                : "6개월 동안 가격 차이가 컸던 상품을 한눈에."}
            </p>
          </div>
          <Link
            className="text-link"
            href={`/rankings?period=${period}${category === "ALL" ? "" : `&category=${category}`}`}
          >
            전체 순위 <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="ranking-toolbar">
          <div className="chip-group" aria-label="순위 카테고리">
            <button
              className="filter-chip"
              aria-pressed={category === "ALL"}
              onClick={() => setCategory("ALL")}
            >
              전체
            </button>
            {VISIBLE_PRODUCT_CATEGORIES.map(item => (
              <button
                key={item}
                className="filter-chip"
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {getCategoryLabel(item)}
              </button>
            ))}
          </div>
          <span>{short ? "실제 관측 기간 기준" : "6개월 변동폭 기준"}</span>
        </div>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {category === "ALL" ? "전체" : getCategoryLabel(category)} 순위{" "}
          {visible.length}개
        </div>
        <ProductList
          products={visible}
          rangeLabel={short ? "관측 기간 변동폭" : "6개월 변동폭"}
          showObservationPeriod={short}
        />
        {!visible.length &&
          !loading &&
          !error &&
          !scoped.loading &&
          !scoped.error && <p role="status">데이터 부족</p>}
        {(category !== "ALL" || short) && (
          <ProductLoadState
            loading={scoped.loading}
            error={scoped.error}
            retry={scoped.retry}
          />
        )}
      </div>
    </section>
  );
}
