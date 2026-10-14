import { Header } from "@/components/Header";
import { ProductList } from "@/components/ProductList";
import { PageHeading } from "@/components/PageHeading";
import { SiteFooter } from "@/components/SiteFooter";
import {
  getCategoryLabel,
  isProductCategory,
  VISIBLE_PRODUCT_CATEGORIES,
  type ProductCategory,
} from "@/domain/category";
import { useAppContext } from "@/contexts/AppContext";
import { sortProducts, type ProductSort } from "@/services/productService";
import {
  calculatePagination,
  getPageNumbers,
  getPaginatedItems,
} from "@/lib/pagination";
import { ChevronLeft, ChevronRight, Search, SearchX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const ITEMS_PER_PAGE = 10;
const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "range", label: "가격 변동폭 큰 순" },
  { value: "price-asc", label: "현재 가격 낮은 순" },
  { value: "price-desc", label: "현재 가격 높은 순" },
  { value: "near-low", label: "최저가 근접 순" },
];

function getInitialState() {
  const params = new URLSearchParams(window.location.search);
  const rawCategory = params.get("category");
  const rawSort = params.get("sort") as ProductSort | null;
  const rawPage = Number(params.get("page"));

  return {
    category: isProductCategory(rawCategory) ? rawCategory : "ALL",
    sort: SORT_OPTIONS.some(option => option.value === rawSort)
      ? rawSort!
      : ("range" as ProductSort),
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  } as {
    category: ProductCategory | "ALL";
    sort: ProductSort;
    page: number;
  };
}

export default function RankingsPage() {
  const { products } = useAppContext();
  const initial = useMemo(getInitialState, []);
  const [category, setCategory] = useState<ProductCategory | "ALL">(
    initial.category
  );
  const [sort, setSort] = useState<ProductSort>(initial.sort);
  const [currentPage, setCurrentPage] = useState(initial.page);
  const [query, setQuery] = useState(
    () => new URLSearchParams(window.location.search).get("q") || ""
  );

  const sortedProducts = useMemo(() => {
    const filtered =
      category === "ALL"
        ? products
        : products.filter(product => product.category === category);
    const normalized = query.trim().toLocaleLowerCase();
    return sortProducts(
      filtered.filter(product =>
        `${product.manufacturer} ${product.modelName} ${product.displayName} ${product.tags.join(" ")}`
          .toLocaleLowerCase()
          .includes(normalized)
      ),
      sort
    );
  }, [category, products, query, sort]);

  const pagination = calculatePagination(
    sortedProducts.length,
    ITEMS_PER_PAGE,
    currentPage
  );
  const pageProducts = getPaginatedItems(
    sortedProducts,
    pagination.currentPage,
    ITEMS_PER_PAGE
  );
  const pageNumbers = getPageNumbers(
    pagination.currentPage,
    pagination.totalPages,
    5
  );

  useEffect(() => {
    if (currentPage !== pagination.currentPage) {
      setCurrentPage(pagination.currentPage);
    }
  }, [currentPage, pagination.currentPage]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== "ALL") params.set("category", category);
    if (query.trim()) params.set("q", query.trim());
    params.set("sort", sort);
    params.set("page", String(pagination.currentPage));
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`
    );
  }, [category, pagination.currentPage, query, sort]);

  const updateCategory = (nextCategory: ProductCategory | "ALL") => {
    setCategory(nextCategory);
    setCurrentPage(1);
  };

  const updateSort = (nextSort: ProductSort) => {
    setSort(nextSort);
    setCurrentPage(1);
  };

  return (
    <div className="app-shell">
      <Header />
      <main id="main-content">
        <PageHeading
          title="전체 가격 순위"
          description="변동폭부터 최저가까지. 원하는 기준으로 상품을 비교하세요."
        />
        <section className="container discovery-section" id="rankings-section">
          <div className="ranking-controls">
            <fieldset>
              <legend>카테고리</legend>
              <div className="chip-group">
                <button
                  type="button"
                  className="filter-chip"
                  aria-pressed={category === "ALL"}
                  onClick={() => updateCategory("ALL")}
                >
                  전체
                </button>
                {VISIBLE_PRODUCT_CATEGORIES.map(item => (
                  <button
                    key={item}
                    type="button"
                    className="filter-chip"
                    aria-pressed={category === item}
                    onClick={() => updateCategory(item)}
                  >
                    {getCategoryLabel(item)}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="filter-tools">
              <label className="search-field">
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">상품명 또는 제조사 검색</span>
                <input
                  type="search"
                  placeholder="상품명 또는 제조사 검색"
                  value={query}
                  onChange={event => {
                    setQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                />
              </label>
              <label className="sort-label">
                정렬
                <select
                  value={sort}
                  onChange={event =>
                    updateSort(event.target.value as ProductSort)
                  }
                  className="mt-2 block rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  {SORT_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="results-heading">
            <h2>
              {category === "ALL" ? "전체 상품" : getCategoryLabel(category)}
            </h2>
            <span role="status" aria-live="polite">
              총 {sortedProducts.length}개 상품
            </span>
          </div>
          {pageProducts.length ? (
            <ProductList
              products={pageProducts}
              offset={(pagination.currentPage - 1) * ITEMS_PER_PAGE}
            />
          ) : (
            <div className="empty-state">
              <SearchX size={32} aria-hidden="true" />
              <h2>검색 결과가 없습니다</h2>
              <p>다른 상품명이나 제조사로 검색해 보세요.</p>
              <button
                className="button-secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("ALL");
                  setCurrentPage(1);
                }}
              >
                검색 조건 초기화
              </button>
            </div>
          )}
          <nav
            className="mt-10 flex flex-wrap items-center justify-center gap-2"
            aria-label="전체 순위 페이지"
          >
            <button
              type="button"
              className="pagination-button"
              aria-label="이전 페이지"
              disabled={pagination.currentPage === 1}
              onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {pageNumbers.map((page, index) =>
              typeof page === "number" ? (
                <button
                  key={page}
                  type="button"
                  className="pagination-button"
                  aria-current={
                    page === pagination.currentPage ? "page" : undefined
                  }
                  aria-label={`${page}페이지`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ) : (
                <span
                  key={`${page}-${index}`}
                  className="px-1 text-[var(--text-muted)]"
                  aria-hidden="true"
                >
                  …
                </span>
              )
            )}
            <button
              type="button"
              className="pagination-button"
              aria-label="다음 페이지"
              disabled={pagination.currentPage === pagination.totalPages}
              onClick={() =>
                setCurrentPage(page =>
                  Math.min(pagination.totalPages, page + 1)
                )
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
          <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
            페이지 {pagination.currentPage} / {pagination.totalPages} · 페이지당
            10개
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
