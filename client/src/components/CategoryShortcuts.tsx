import {
  PRODUCT_CATEGORIES,
  VISIBLE_PRODUCT_CATEGORIES,
} from "@/domain/category";
import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";
import type { CatalogSummary } from "@shared/productPage";

export function CategoryShortcuts({
  summaries,
}: {
  summaries: CatalogSummary[];
}) {
  return (
    <section className="category-shortcuts">
      <div className="container">
        <div className="section-heading">
          <h2>어떤 상품을 찾으세요?</h2>
          <span>카테고리로 빠르게 탐색하세요</span>
        </div>
        <div className="category-grid">
          {VISIBLE_PRODUCT_CATEGORIES.map(category => {
            const definition = PRODUCT_CATEGORIES[category];
            const summary = summaries.find(s => s.category === category);
            return (
              <Link
                key={category}
                href={`/categories?category=${category}`}
                className="category-tile"
              >
                <div>
                  <span>
                    {category === "GPU"
                      ? "Graphics card"
                      : category === "CPU"
                        ? "Processor"
                        : "Laptop"}
                  </span>
                  <h3>{definition.label}</h3>
                  <p>{summary?.productCount ?? 0}개 상품</p>
                </div>
                <img src={definition.imageUrl} alt="" width="112" height="80" />
                <ArrowUpRight
                  className="category-arrow"
                  size={19}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
