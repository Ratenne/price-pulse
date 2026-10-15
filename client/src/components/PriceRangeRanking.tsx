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

export function PriceRangeRanking({ products }: { products: Product[] }) {
  const [category, setCategory] = useState<ProductCategory | "ALL">("ALL");
  const scoped = useProductPage(
    `view=rankings&category=${category === "ALL" ? "" : category}`,
    category !== "ALL"
  );
  const visible = category === "ALL" ? products : scoped.data.products;
  return (
    <section className="discovery-section" id="price-rankings">
      <div className="container">
        <div className="section-heading">
          <div>
            <h2>가격 변동폭 TOP 10</h2>
            <p>6개월 동안 가격 차이가 컸던 상품을 한눈에.</p>
          </div>
          <Link
            className="text-link"
            href={`/rankings${category === "ALL" ? "" : `?category=${category}`}`}
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
          <span>6개월 변동폭 기준</span>
        </div>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {category === "ALL" ? "전체" : getCategoryLabel(category)} 순위{" "}
          {visible.length}개
        </div>
        <ProductList products={visible} />
        {category !== "ALL" && (
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
