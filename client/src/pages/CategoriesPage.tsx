import { Header } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
import { SiteFooter } from "@/components/SiteFooter";
import {
  isProductCategory,
  PRODUCT_CATEGORIES,
  VISIBLE_PRODUCT_CATEGORIES,
  type ProductCategory,
} from "@/domain/category";
import {
  getCategorySummary,
  getProductsByCategory,
  sortProducts,
} from "@/services/productService";
import { useMemo, useState } from "react";

function getInitialCategory(): ProductCategory {
  const value = new URLSearchParams(window.location.search).get("category");
  return isProductCategory(value) ? value : "GPU";
}

export default function CategoriesPage() {
  const [category, setCategory] = useState<ProductCategory>(getInitialCategory);
  const definition = PRODUCT_CATEGORIES[category];
  const products = useMemo(
    () => sortProducts(getProductsByCategory(category), "range"),
    [category]
  );
  const summary = getCategorySummary(category);
  const nearLowest = products.filter(
    product => product.currentPrice <= product.sixMonthLowPrice * 1.1
  );

  const selectCategory = (nextCategory: ProductCategory) => {
    setCategory(nextCategory);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?category=${nextCategory}`
    );
  };

  return (
    <div className="app-shell">
      <Header />
      <main>
        <section className="border-b border-[var(--border)] bg-[var(--surface-muted)] py-12">
          <div className="container grid items-center gap-8 md:grid-cols-[1fr_280px]">
            <div>
              <p className="text-sm font-semibold text-[var(--orange-strong)]">
                카테고리 가격 가이드
              </p>
              <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)] md:text-4xl">
                {definition.label}
              </h1>
              <p className="mt-4 max-w-2xl leading-relaxed text-[var(--text-secondary)]">
                {definition.detail}
              </p>
            </div>
            <img
              src={definition.imageUrl}
              alt={`${definition.label} 카테고리 대표 이미지`}
              className="h-44 w-full rounded-2xl bg-[#111923] object-contain p-3"
            />
          </div>
        </section>

        <div className="sticky top-[65px] z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
          <div
            className="container flex gap-2 overflow-x-auto py-3"
            role="tablist"
            aria-label="상품 카테고리 선택"
          >
            {VISIBLE_PRODUCT_CATEGORIES.map(item => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={category === item}
                className="filter-chip"
                onClick={() => selectCategory(item)}
              >
                {PRODUCT_CATEGORIES[item].label}
              </button>
            ))}
          </div>
        </div>

        <section className="container py-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            가격 흐름 요약
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="summary-card">
              <span className="text-sm text-[var(--text-muted)]">
                예시 상품
              </span>
              <strong className="mt-2 block text-2xl text-[var(--text-primary)]">
                {summary.productCount}개
              </strong>
            </div>
            <div className="summary-card">
              <span className="text-sm text-[var(--text-muted)]">
                평균 가격 변동폭
              </span>
              <strong className="mt-2 block text-2xl text-[var(--text-primary)]">
                {summary.averageRangeRate.toFixed(1)}%
              </strong>
            </div>
            <div className="summary-card">
              <span className="text-sm text-[var(--text-muted)]">
                최저가 근접
              </span>
              <strong className="mt-2 block text-2xl text-[var(--sky-blue-strong)]">
                {summary.nearLowestCount}개
              </strong>
            </div>
          </div>
        </section>

        <section className="bg-[var(--surface-muted)] py-12">
          <div className="container">
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              {definition.label} 가격 변동폭 순위
            </h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {products.slice(0, 3).map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  rank={index + 1}
                  showRangeAmount
                />
              ))}
            </div>
          </div>
        </section>

        <section className="container py-12">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            최근 최저가에 가까운 {definition.label}
          </h2>
          <p className="mt-2 text-[var(--text-secondary)]">
            최근 최저 가격과 현재 가격의 거리를 함께 확인합니다.
          </p>
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {nearLowest.length > 0 ? (
              nearLowest
                .slice(0, 3)
                .map(product => (
                  <ProductCard key={product.id} product={product} />
                ))
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                현재 조건에 해당하는 예시 상품이 없습니다.
              </p>
            )}
          </div>
        </section>

        <section className="border-t border-[var(--border)] bg-[var(--background)] py-12">
          <div className="container">
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              전체 {definition.label}
            </h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {products.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
