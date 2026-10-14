import { CategoryShortcuts } from "@/components/CategoryShortcuts";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { PriceRangeRanking } from "@/components/PriceRangeRanking";
import { ProductCard } from "@/components/ProductCard";
import { SiteFooter } from "@/components/SiteFooter";
import { useAppContext } from "@/contexts/AppContext";
import {
  getNearLowestPriceProducts,
  getTopPriceRangeProducts,
} from "@/services/productService";
import { ArrowRight, Scale } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard({
  ambientEnabled = true,
}: {
  ambientEnabled?: boolean;
}) {
  const { products } = useAppContext();
  const topProducts = getTopPriceRangeProducts(10);
  const nearLowest = getNearLowestPriceProducts(3);
  return (
    <div className="app-shell">
      <Header />
      <main id="main-content">
        <HeroSection
          featuredProduct={topProducts[0]}
          ambientEnabled={ambientEnabled}
        />
        <CategoryShortcuts />
        <PriceRangeRanking products={topProducts} />
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
            <div className="product-grid">
              {nearLowest.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
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
          현재 {products.length}개 상품의 가격은 서비스 시연을 위한 예시
          데이터입니다.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
