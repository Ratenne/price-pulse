import { Header } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
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
import { ChevronLeft, ChevronRight } from "lucide-react";
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

  const sortedProducts = useMemo(() => {
    const filtered =
      category === "ALL"
        ? products
        : products.filter(product => product.category === category);
    return sortProducts(filtered, sort);
  }, [category, products, sort]);

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
    params.set("sort", sort);
    params.set("page", String(pagination.currentPage));
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`
    );
  }, [category, pagination.currentPage, sort]);

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
      <main>
        <section className="border-b border-[var(--border)] bg-[var(--surface-muted)] py-12">
          <div className="container">
            <p className="text-sm font-semibold text-[var(--orange-strong)]">
              PC 상품 가격 비교
            </p>
            <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)] md:text-4xl">
              전체 순위
            </h1>
            <p className="mt-3 text-[var(--text-secondary)]">
              가격 변동폭과 현재 가격 위치를 원하는 기준으로 비교하세요.
            </p>
          </div>
        </section>

        <section className="container py-10" id="rankings-section">
          <div className="mb-8 flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:flex-row md:items-end md:justify-between">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
                카테고리
              </legend>
              <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
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
            <label className="text-xs font-semibold text-[var(--text-muted)]">
              정렬
              <select
                value={sort}
                onChange={event =>
                  updateSort(event.target.value as ProductSort)
                }
                className="mt-2 block w-full min-w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] md:w-auto"
              >
                {SORT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-semibold text-[var(--text-primary)]">
              {category === "ALL" ? "전체 상품" : getCategoryLabel(category)}
            </h2>
            <span className="text-sm text-[var(--text-muted)]">
              총 {sortedProducts.length}개
            </span>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {pageProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                rank={(pagination.currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                showRangeAmount
              />
            ))}
          </div>

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
