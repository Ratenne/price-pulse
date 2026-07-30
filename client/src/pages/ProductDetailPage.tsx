import { Header } from "@/components/Header";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { PriceRangeBar } from "@/components/PriceRangeBar";
import { ProductCard } from "@/components/ProductCard";
import { SiteFooter } from "@/components/SiteFooter";
import { getCategoryLabel } from "@/domain/category";
import {
  formatPrice,
  getBuyerPerspective,
  getSellerPerspective,
  PRICE_STATUS_LABELS,
} from "@/lib/productFormatting";
import { getProductById, getRelatedProducts } from "@/services/productService";
import { ArrowLeft, Eye, HandCoins } from "lucide-react";
import { Link } from "wouter";
import NotFound from "./NotFound";

export default function ProductDetailPage({ id }: { id: string }) {
  const product = getProductById(id);
  if (!product) return <NotFound />;

  const buyerMessages = getBuyerPerspective(product);
  const sellerMessages = getSellerPerspective(product);
  const relatedProducts = getRelatedProducts(product);

  return (
    <div className="app-shell">
      <Header />
      <main>
        <section className="container py-8">
          <Link
            href="/rankings"
            className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" /> 전체 순위
          </Link>

          <div className="mt-6 grid gap-8 lg:grid-cols-[360px_1fr]">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-6">
              <img
                src={product.imageUrl}
                alt={`${product.displayName} 대표 이미지`}
                className="h-64 w-full object-contain"
              />
            </div>
            <div>
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
                {formatPrice(product.currentPrice)}
              </p>
              <div className="mt-7 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <PriceRangeBar product={product} />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="summary-card">
                  <span className="text-xs text-[var(--text-muted)]">
                    평균 가격
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
          <div className="container rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 md:p-7">
            <PriceHistoryChart product={product} height={300} />
          </div>
        </section>

        <section className="container py-12">
          <div className="grid gap-6 md:grid-cols-2">
            <article className="perspective-card perspective-card--buyer">
              <Eye className="h-6 w-6 text-[var(--sky-blue-strong)]" />
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
              <HandCoins className="h-6 w-6 text-[var(--orange-strong)]" />
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
              {new Date(product.updatedAt).toLocaleString("ko-KR")} · 현재
              가격은 서비스 시연용 예시입니다.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
