import { Header } from "@/components/Header";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { PriceRangeBar } from "@/components/PriceRangeBar";
import { ProductCard } from "@/components/ProductCard";
import { SiteFooter } from "@/components/SiteFooter";
import { getCategoryLabel } from "@/domain/category";
import {
  formatPrice,
  formatCurrentPrice,
  getBuyerPerspective,
  getSellerPerspective,
  PRICE_STATUS_LABELS,
} from "@/lib/productFormatting";
import { getProductById, getRelatedProducts } from "@/services/productService";
import { ArrowLeft, Eye, HandCoins } from "lucide-react";
import { Link } from "wouter";
import NotFound from "./NotFound";
import { useProductPage } from "@/hooks/useProductPage";
import { ProductLoadState } from "@/components/ProductLoadState";

export default function ProductDetailPage({ id }: { id: string }) {
  const state = useProductPage(`view=detail&id=${encodeURIComponent(id)}`);
  const products = state.data.products;
  if (state.loading || state.error)
    return (
      <div className="app-shell">
        <Header />
        <main id="main-content">
          <ProductLoadState
            loading={state.loading}
            error={state.error}
            retry={state.retry}
          />
        </main>
        <SiteFooter />
      </div>
    );
  const product = getProductById(id, products);
  if (!product) return <NotFound />;

  const buyerMessages = getBuyerPerspective(product);
  const sellerMessages = getSellerPerspective(product);
  const relatedProducts = getRelatedProducts(product, 3, products);

  return (
    <div className="app-shell">
      <Header />
      <main id="main-content">
        <section className="container detail-intro">
          <Link
            href="/rankings"
            className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" /> 전체 순위
          </Link>

          <div className="detail-layout">
            <div className="detail-image">
              <img
                src={product.imageUrl}
                alt={`${product.displayName} 대표 이미지`}
                className="h-64 w-full object-contain"
              />
            </div>
            <div className="detail-info">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--sky-blue-soft)] px-3 py-1 text-xs font-semibold text-[var(--sky-blue-strong)]">
                  {getCategoryLabel(product.category)}
                </span>
                <span
                  className="price-status"
                  data-status={product.priceStatus}
                >
                  {PRICE_STATUS_LABELS[product.priceStatus]}
                </span>
              </div>
              <p className="mt-5 text-sm text-[var(--text-muted)]">
                {product.manufacturer}
              </p>
              <h1 className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
                {product.modelName}
              </h1>
              <p className="mt-6 text-sm text-[var(--text-secondary)]">
                현재 가격
              </p>
              <p className="mt-1 text-3xl font-extrabold text-[var(--text-primary)]">
                {formatCurrentPrice(product)}
              </p>
              <div className="mt-7 rounded-xl bg-[var(--surface)] p-5">
                <PriceRangeBar product={product} />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="summary-card">
                  <span className="text-xs text-[var(--text-muted)]">
                    월별 최저가 평균
                  </span>
                  <strong className="mt-1 block text-[var(--text-primary)]">
                    {formatPrice(product.sixMonthAveragePrice)}
                  </strong>
                </div>
                <div className="summary-card">
                  <span className="text-xs text-[var(--text-muted)]">
                    적정 범위 하단
                  </span>
                  <strong className="mt-1 block text-[var(--text-primary)]">
                    {formatPrice(product.fairPriceMin)}
                  </strong>
                </div>
                <div className="summary-card">
                  <span className="text-xs text-[var(--text-muted)]">
                    적정 범위 상단
                  </span>
                  <strong className="mt-1 block text-[var(--text-primary)]">
                    {formatPrice(product.fairPriceMax)}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--surface-muted)] py-12">
          <div className="container">
            <div className="detail-chart">
              <PriceHistoryChart product={product} height={300} />
            </div>
          </div>
        </section>

        <section className="container py-12">
          <div className="grid gap-6 md:grid-cols-2">
            <article className="perspective-card perspective-card--buyer">
              <Eye
                className="h-6 w-6 text-[var(--sky-blue-strong)]"
                aria-hidden="true"
              />
              <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
                구매자 관점
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {buyerMessages.map(message => (
                  <li key={message}>• {message}</li>
                ))}
              </ul>
            </article>
            <article className="perspective-card perspective-card--seller">
              <HandCoins
                className="h-6 w-6 text-[var(--orange-strong)]"
                aria-hidden="true"
              />
              <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
                판매자 관점
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {sellerMessages.map(message => (
                  <li key={message}>• {message}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="bg-[var(--surface-muted)] py-12">
          <div className="container">
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              관련 상품
            </h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {relatedProducts.map(related => (
                <ProductCard key={related.id} product={related} />
              ))}
            </div>
            <p className="mt-6 text-xs text-[var(--text-muted)]">
              데이터 업데이트:{" "}
              {new Date(product.updatedAt).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}{" "}
              · 마지막 이력 월: {product.latestHistoryMonth} · 현재가 조회:{" "}
              {product.currentPriceCheckedAt
                ? new Date(product.currentPriceCheckedAt).toLocaleString(
                    "ko-KR",
                    { timeZone: "Asia/Seoul" }
                  )
                : product.priceStatus === "LOADING"
                  ? "확인 중"
                  : "실패"}
              {product.sourceUrl && (
                <a
                  href={product.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link ml-3"
                >
                  다나와 원본 보기
                </a>
              )}
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
