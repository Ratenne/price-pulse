import type { Product } from "@/domain/product";
import { Link } from "wouter";
import { ArrowUpRight, ArrowRight, ChartNoAxesCombined } from "lucide-react";
import { PriceHistoryChart } from "./PriceHistoryChart";
import { formatPrice, PRICE_STATUS_LABELS } from "@/lib/productFormatting";

export function HeroSection({
  featuredProduct,
}: {
  featuredProduct: Product;
  ambientEnabled?: boolean;
}) {
  return (
    <section className="discovery-hero">
      <div className="container hero-layout">
        <div className="hero-copy">
          <h1>
            가격의 흐름을 읽고,
            <br />
            좋은 선택을 하세요.
          </h1>
          <p>
            그래픽카드부터 노트북까지.
            <br />
            6개월 가격 순위로 지금의 가격을 비교하세요.
          </p>
          <Link href="/rankings" className="button-primary">
            가격 순위 둘러보기 <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <div className="hero-note">
            <ChartNoAxesCombined size={17} aria-hidden="true" /> 6개월 가격 기록
            <span>다나와 월별 최저가</span>
          </div>
        </div>
        <div className="hero-market" data-ui>
          <div className="market-heading">
            <h2>주목할 가격 흐름</h2>
            <span>최근 6개월</span>
          </div>
          <Link
            className="market-product"
            href={`/products/${featuredProduct.id}`}
          >
            <img src={featuredProduct.imageUrl} alt="" width="64" height="64" />
            <div>
              <span>{featuredProduct.manufacturer}</span>
              <h3>{featuredProduct.modelName}</h3>
            </div>
            <ArrowUpRight size={20} aria-hidden="true" />
          </Link>
          <div className="market-price">
            <strong>{formatPrice(featuredProduct.currentPrice)}</strong>
            <span
              className="price-status"
              data-status={featuredProduct.priceStatus}
            >
              {PRICE_STATUS_LABELS[featuredProduct.priceStatus]}
            </span>
          </div>
          <PriceHistoryChart
            product={featuredProduct}
            height={150}
            showHeading={false}
          />
          <div className="market-bottom">
            <span>
              6개월 최저{" "}
              <strong>{formatPrice(featuredProduct.sixMonthLowPrice)}</strong>
            </span>
            <Link href={`/products/${featuredProduct.id}`}>
              가격 자세히 보기 <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
