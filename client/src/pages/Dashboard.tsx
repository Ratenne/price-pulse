import { CategoryShortcuts } from "@/components/CategoryShortcuts";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { PriceRangeRanking } from "@/components/PriceRangeRanking";
import { ProductCard } from "@/components/ProductCard";
import { SiteFooter } from "@/components/SiteFooter";
import {
  PRODUCT_CATEGORIES,
  VISIBLE_PRODUCT_CATEGORIES,
} from "@/domain/category";
import { useAppContext } from "@/contexts/AppContext";
import {
  getCategorySummary,
  getNearLowestPriceProducts,
  getTopPriceRangeProducts,
} from "@/services/productService";
import { ArrowRight, Handshake } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard({
  ambientEnabled = true,
}: {
  ambientEnabled?: boolean;
}) {
  const { products } = useAppContext();
  const topProducts = getTopPriceRangeProducts(10);
  const nearLowest = getNearLowestPriceProducts(6);

  return (
    <div className="app-shell">
      <Header />
      <main>
        <HeroSection
          featuredProduct={topProducts[0]}
          ambientEnabled={ambientEnabled}
        />
        <CategoryShortcuts />
        <PriceRangeRanking products={topProducts} />

        <section className="bg-[var(--surface-muted)] py-14">
          <div className="container">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
                최근 최저가에 가까운 상품
              </h2>
              <p className="mt-2 text-[var(--text-secondary)]">
                과거 최저 가격과 현재 가격의 거리를 기준으로 확인합니다.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {nearLowest.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--background)] py-14">
          <div className="container">
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              카테고리별 요약
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {VISIBLE_PRODUCT_CATEGORIES.map(category => {
                const summary = getCategorySummary(category);
                return (
                  <div key={category} className="summary-card">
                    <p className="font-bold text-[var(--text-primary)]">
                      {PRODUCT_CATEGORIES[category].label}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      평균 가격 변동폭 {summary.averageRangeRate.toFixed(1)}%
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      예시 상품 {summary.productCount}개를 비교합니다.
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border)] bg-[var(--surface)] py-14">
          <div className="container flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="flex gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--orange-soft)] text-[var(--orange-strong)]">
                <Handshake className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">
                  구매자와 판매자 모두 납득할 수 있는 가격
                </h2>
                <p className="mt-2 max-w-2xl text-[var(--text-secondary)]">
                  가격 흐름에서 현재 위치와 적정 거래 범위를 함께 확인하세요.
                </p>
              </div>
            </div>
            <Link href="/safe-trade" className="button-secondary shrink-0">
              안심거래 안내 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <p className="container py-5 text-xs text-[var(--text-muted)]">
          현재 화면의 {products.length}개 가격 데이터는 서비스 시연을 위한
          예시입니다.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
