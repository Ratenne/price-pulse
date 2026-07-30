import {
  PRODUCT_CATEGORIES,
  VISIBLE_PRODUCT_CATEGORIES,
} from "@/domain/category";
import { getCategorySummary } from "@/services/productService";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";

export function CategoryShortcuts() {
  return (
    <section className="border-y border-[var(--border)] bg-[var(--surface-muted)] py-12">
      <div className="container">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            카테고리 바로가기
          </h2>
          <p className="mt-1 text-[var(--text-secondary)]">
            필요한 상품군의 가격 흐름부터 확인하세요.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {VISIBLE_PRODUCT_CATEGORIES.map(category => {
            const definition = PRODUCT_CATEGORIES[category];
            const summary = getCategorySummary(category);
            return (
              <Link
                key={category}
                href={`/categories?category=${category}`}
                className="category-card"
              >
                <img
                  src={definition.imageUrl}
                  alt=""
                  className="h-24 w-28 rounded-lg object-contain"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-[var(--text-primary)]">
                    {definition.label}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {definition.description}
                  </p>
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    예시 상품 {summary.productCount}개 · 최저가 근접{" "}
                    {summary.nearLowestCount}개
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-[var(--orange)]" />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
