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
import { type ProductSort } from "@/services/productService";
import { useProductPage } from "@/hooks/useProductPage";
import { ProductLoadState } from "@/components/ProductLoadState";
import { calculatePagination, getPageNumbers } from "@/lib/pagination";
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
  const initial = useMemo(getInitialState, []);
  const [category, setCategory] = useState<ProductCategory | "ALL">(
    initial.category
  );
  const [sort, setSort] = useState<ProductSort>(initial.sort);
  const [period, setPeriod] = useState(() => {
    const value = new URLSearchParams(window.location.search).get("period");
    return value === "under-six-months" || value === "all"
      ? value
      : initial.sort === "range" || value === "six-months"
        ? "six-months"
        : "all";
  });
  const [currentPage, setCurrentPage] = useState(initial.page);
  const [query, setQuery] = useState(
    () => new URLSearchParams(window.location.search).get("q") || ""
  );

  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const request = new URLSearchParams({
    view: "rankings",
    sort,
    page: String(currentPage),
    q: debouncedQuery,
    period,
  });
  if (category !== "ALL") request.set("category", category);
  const state = useProductPage(request.toString());

  const pagination = calculatePagination(
    state.data.total,
    ITEMS_PER_PAGE,
    currentPage
  );
  const pageProducts = state.data.products;
  const pageNumbers = getPageNumbers(
    pagination.currentPage,
    pagination.totalPages,
    5
  );

  useEffect(() => {
    if (!state.loading && !state.error && currentPage !== state.data.page) {
      setCurrentPage(state.data.page);
    }
  }, [currentPage, state.loading, state.error, state.data.page]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== "ALL") params.set("category", category);
    if (query.trim()) params.set("q", query.trim());
    params.set("sort", sort);
    params.set("page", String(currentPage));
    params.set("period", period);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`
    );
  }, [category, currentPage, query, sort, period]);

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
              <legend>관측 기간</legend>
              <div className="chip-group">
                {[
                  ["six-months", "6개월 이상"],
                  ["under-six-months", "6개월 미만"],
                  ["all", "전체 상품"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="filter-chip"
                    aria-pressed={period === value}
                    onClick={() => {
                      setPeriod(value);
                      setCurrentPage(1);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
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
              {state.loading ? "조회 중" : `총 ${state.data.total}개 상품`}
            </span>
          </div>
          <ProductLoadState
            loading={state.loading}
            error={state.error}
            retry={state.retry}
          />
          {pageProducts.length ? (
            <ProductList
              products={pageProducts}
              offset={(pagination.currentPage - 1) * ITEMS_PER_PAGE}
              rangeLabel={
                period === "six-months" ? "6개월 변동폭" : "관측 기간 변동폭"
              }
              showObservationPeriod={period !== "six-months"}
              ranked={period !== "all"}
            />
          ) : !state.loading && !state.error ? (
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
          ) : null}
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
