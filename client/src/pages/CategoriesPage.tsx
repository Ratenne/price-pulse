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
import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useProductPage } from "@/hooks/useProductPage";
import { ProductLoadState } from "@/components/ProductLoadState";
import { NearLowestProducts } from "@/components/NearLowestProducts";

function getInitialCategory(): ProductCategory {
  const value = new URLSearchParams(window.location.search).get("category");
  return isProductCategory(value) ? value : "GPU";
}
export default function CategoriesPage() {
  const [category, setCategory] = useState<ProductCategory>(getInitialCategory);
  const [page, setPage] = useState(1);
  const state = useProductPage(
    `view=category&category=${category}&page=${page}`
  );
  const ranking = useProductPage(
    `view=rankings&period=six-months&category=${category}`
  );
  const definition = PRODUCT_CATEGORIES[category];
  const products = state.data.products;
  const summary = state.data.summaries.find(s => s.category === category);
  const selectCategory = (next: ProductCategory) => {
    setCategory(next);
    setPage(1);
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
            <p>확보된 가격 기록을 기준으로 비교합니다.</p>
          </div>
          <dl>
            <dt>비교 상품</dt>
            <dd>
              {summary?.productCount ?? 0}
              <span className="text-sm font-normal"> 개</span>
            </dd>
          </dl>
          <dl>
            <dt>평균 가격 변동폭</dt>
            <dd>
              {summary?.averageRangeRate == null
                ? "데이터 부족"
                : `${summary.averageRangeRate.toFixed(1)}%`}
            </dd>
          </dl>
          <dl>
            <dt>현재 가격</dt>
            <dd>조회 시 확인</dd>
          </dl>
        </section>
        <section className="container discovery-section">
          <ProductLoadState
            loading={state.loading}
            error={state.error}
            retry={state.retry}
          />
          <div className="section-heading">
            <div>
              <h2>{definition.label} 변동폭 순위</h2>
              <p>가격 차이가 컸던 상품부터 확인하세요.</p>
            </div>
            <Link className="text-link" href={`/rankings?category=${category}`}>
              순위 더 보기 <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <ProductLoadState
            loading={ranking.loading}
            error={ranking.error}
            retry={ranking.retry}
          />
          <ProductList products={ranking.data.products.slice(0, 5)} />
        </section>
        <section className="discovery-section low-price-section">
          <div className="container">
            <div className="section-heading">
              <div>
                <h2>최저가에 가까운 {definition.label}</h2>
                <p>6개월 최저 가격 대비 10% 이내의 상품입니다.</p>
              </div>
            </div>
            {!state.loading && !state.error && (
              <NearLowestProducts category={category} />
            )}
          </div>
        </section>
        <section className="container discovery-section">
          <div className="section-heading">
            <h2>전체 {definition.label}</h2>
            <span>{state.data.total}개 상품</span>
          </div>
          <div className="product-grid">
            {!state.loading && !state.error && products.length === 0 && (
              <p>이 카테고리에는 아직 수집된 상품이 없습니다.</p>
            )}
            {products.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <nav
            className="mt-8 flex justify-center gap-4"
            aria-label="카테고리 상품 페이지"
          >
            <button
              className="pagination-button"
              disabled={page <= 1 || state.loading}
              onClick={() => setPage(p => p - 1)}
            >
              이전
            </button>
            <span>
              {state.data.page} /{" "}
              {Math.max(1, Math.ceil(state.data.total / 10))}
            </span>
            <button
              className="pagination-button"
              disabled={
                page >= Math.ceil(state.data.total / 10) || state.loading
              }
              onClick={() => setPage(p => p + 1)}
            >
              다음
            </button>
          </nav>
          <p className="data-notice">
            다나와 월별 최저가 기준이며, 수집되지 않은 월은 표시하지 않습니다.
            적정 범위는 참고용 계산입니다.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
