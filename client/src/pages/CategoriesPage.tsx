import { Header } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
import { ProductList } from "@/components/ProductList";
import { PageHeading } from "@/components/PageHeading";
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
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

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
  const nearLowest = sortProducts(
    products.filter(
      product => product.currentPrice <= product.sixMonthLowPrice * 1.1
    ),
    "near-low"
  );
  const selectCategory = (next: ProductCategory) => {
    setCategory(next);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?category=${next}`
    );
  };
  return (
    <div className="app-shell">
      <Header />
      <main id="main-content">
        <PageHeading
          title={`${definition.label} 가격 탐색`}
          description={definition.detail}
        >
          <img src={definition.imageUrl} alt="" width="150" height="105" />
        </PageHeading>
        <nav className="category-nav" aria-label="상품 카테고리 선택">
          <div className="container chip-group">
            {VISIBLE_PRODUCT_CATEGORIES.map(item => (
              <button
                key={item}
                type="button"
                aria-pressed={category === item}
                className="filter-chip"
                onClick={() => selectCategory(item)}
              >
                {PRODUCT_CATEGORIES[item].label}
              </button>
            ))}
          </div>
        </nav>
        <section
          className="container category-overview"
          aria-label={`${definition.label} 가격 흐름 요약`}
        >
          <div>
            <h2>카테고리 한눈에 보기</h2>
            <p>6개월 가격 기록을 기준으로 비교합니다.</p>
          </div>
          <dl>
            <dt>비교 상품</dt>
            <dd>
              {summary.productCount}
              <span className="text-sm font-normal"> 개</span>
            </dd>
          </dl>
          <dl>
            <dt>평균 가격 변동폭</dt>
            <dd>
              {summary.averageRangeRate.toFixed(1)}
              <span className="text-sm font-normal"> %</span>
            </dd>
          </dl>
          <dl>
            <dt>최저가 근접 상품</dt>
            <dd>
              {summary.nearLowestCount}
              <span className="text-sm font-normal"> 개</span>
            </dd>
          </dl>
        </section>
        <section className="container discovery-section">
          <div className="section-heading">
            <div>
              <h2>{definition.label} 변동폭 순위</h2>
              <p>가격 차이가 컸던 상품부터 확인하세요.</p>
            </div>
            <Link className="text-link" href={`/rankings?category=${category}`}>
              순위 더 보기 <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <ProductList products={products.slice(0, 5)} />
        </section>
        <section className="discovery-section low-price-section">
          <div className="container">
            <div className="section-heading">
              <div>
                <h2>최저가에 가까운 {definition.label}</h2>
                <p>6개월 최저 가격 대비 10% 이내의 상품입니다.</p>
              </div>
            </div>
            <div className="product-grid">
              {nearLowest.length ? (
                nearLowest
                  .slice(0, 3)
                  .map(product => (
                    <ProductCard key={product.id} product={product} />
                  ))
              ) : (
                <p className="text-[var(--text-secondary)]">
                  현재 조건에 해당하는 상품이 없습니다.
                </p>
              )}
            </div>
          </div>
        </section>
        <section className="container discovery-section">
          <div className="section-heading">
            <h2>전체 {definition.label}</h2>
            <span>{products.length}개 상품</span>
          </div>
          <div className="product-grid">
            {products.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <p className="data-notice">
            상품 가격과 가격 범위는 서비스 시연을 위한 예시입니다.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
