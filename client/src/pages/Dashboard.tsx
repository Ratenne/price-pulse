import { CategoryShortcuts } from "@/components/CategoryShortcuts";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { PriceRangeRanking } from "@/components/PriceRangeRanking";
import { SiteFooter } from "@/components/SiteFooter";
import { useProductPage } from "@/hooks/useProductPage";
import { ProductLoadState } from "@/components/ProductLoadState";
import { NearLowestProducts } from "@/components/NearLowestProducts";
import { ArrowRight, Scale } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard({
  ambientEnabled = true,
}: {
  ambientEnabled?: boolean;
}) {
  const { data, loading, error, retry } = useProductPage("view=home");
  const topProducts = data.products;
  return (
    <div className="app-shell">
      <Header />
      <main id="main-content">
        <ProductLoadState loading={loading} error={error} retry={retry} />
        {topProducts[0] && (
          <HeroSection
            featuredProduct={topProducts[0]}
            ambientEnabled={ambientEnabled}
          />
        )}
        <CategoryShortcuts summaries={data.summaries} />
        <PriceRangeRanking
          products={topProducts}
          loading={loading}
          error={error}
        />
        <PriceRangeRanking products={[]} period="under-six-months" />
        <section className="discovery-section low-price-section">
          <div className="container">
            <div className="section-heading">
              <div>
                <h2>최저가에 가까워진 상품</h2>
                <p>최근 최저 가격과의 차이가 작은 구매 후보를 만나보세요.</p>
              </div>
              <Link className="text-link" href="/rankings?sort=near-low">
                전체 보기 <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            {!loading && !error && <NearLowestProducts />}
          </div>
        </section>
        <section className="container trade-banner">
          <Scale size={30} aria-hidden="true" />
          <div>
            <h2>좋은 거래는, 같은 기준에서.</h2>
            <p>구매자와 판매자 모두를 위한 적정 가격 가이드.</p>
          </div>
          <Link className="button-secondary" href="/safe-trade">
            안심거래 알아보기 <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
        <p className="container data-notice">
          {data.summaries.reduce(
            (total, summary) => total + summary.productCount,
            0
          )}
          개 상품 · 다나와 월별 이력은 3시간마다 수집합니다. 현재가는 저장된
          수집 결과이며 12시간이 지나면 표시하지 않습니다. 검증된 판매처 가격은
          배송비 확인 시 합산하고 미확인 시 표시가격으로 비교합니다. 배송비
          미확인은 무료배송이 아닙니다. 판매처 관측이 없으면 다나와 참고가를
          표시합니다.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
