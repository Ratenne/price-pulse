import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { PriceRangeBar } from "@/components/PriceRangeBar";
import { Eye, HandCoins, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { getTopPriceRangeProducts } from "@/services/productService";
import { formatPrice } from "@/lib/productFormatting";
import { useAppContext } from "@/contexts/AppContext";

export default function SafeTradePage() {
  const { products } = useAppContext();
  const example = getTopPriceRangeProducts(1, products)[0];
  return (
    <div className="app-shell">
      <Header />
      <main id="main-content">
        <section className="guide-intro">
          <div className="container guide-layout">
            <div>
              <h1>
                서로 납득할 수 있는,
                <br />
                거래의 기준.
              </h1>
              <p>
                구매자와 판매자가 같은 가격 흐름을 보고 판단할 수 있도록.
                <br />
                과거 기록에서 현재 가격과 적정 거래 범위를 확인하세요.
              </p>
              <Link href="/rankings" className="button-primary mt-7">
                상품 가격 살펴보기 <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <div className="guide-visual">
              <h2>{example.displayName}</h2>
              <div className="guide-key">
                <span>
                  <Eye size={17} aria-hidden="true" />
                  구매자
                </span>
                <span>같은 가격, 같은 기준</span>
                <span>
                  판매자
                  <HandCoins size={17} aria-hidden="true" />
                </span>
              </div>
              <PriceRangeBar product={example} />
              <p>
                예시 적정 범위{" "}
                <strong className="text-[var(--text-primary)]">
                  {formatPrice(example.fairPriceMin)} ~{" "}
                  {formatPrice(example.fairPriceMax)}
                </strong>
              </p>
            </div>
          </div>
        </section>
        <section className="container discovery-section">
          <div className="grid gap-6 md:grid-cols-2">
            <article className="perspective-card perspective-card--buyer">
              <Eye
                size={24}
                className="text-[var(--sky-blue-strong)]"
                aria-hidden="true"
              />
              <h2 className="mt-4 text-xl font-bold">
                구매할 때, 비싸지 않은지.
              </h2>
              <p className="mt-4 leading-relaxed text-[var(--text-secondary)]">
                현재 가격이 과거 가격 범위에서 어느 위치인지 확인하고, 구매
                판단에 참고할 수 있습니다.
              </p>
            </article>
            <article className="perspective-card perspective-card--seller">
              <HandCoins
                size={24}
                className="text-[var(--orange-strong)]"
                aria-hidden="true"
              />
              <h2 className="mt-4 text-xl font-bold">
                판매할 때, 적절한 가격인지.
              </h2>
              <p className="mt-4 leading-relaxed text-[var(--text-secondary)]">
                시장 가격 흐름을 확인해 판매 속도와 가격 사이의 균형을 판단할 수
                있습니다.
              </p>
            </article>
          </div>
        </section>
        <section className="discovery-section low-price-section">
          <div className="container guide-reference">
            <div>
              <h2>가격을 읽는 세 가지 기준</h2>
              <p className="mt-4 text-[var(--text-secondary)]">
                하나의 숫자보다 흐름 전체를 살펴보세요.
              </p>
            </div>
            <div>
              {[
                [
                  "현재 가격 위치",
                  "최저 가격부터 최고 가격 사이에서 현재 가격이 어느 구간인지 보여줍니다.",
                ],
                [
                  "적정 거래 가격 범위",
                  "과거 흐름과 평균 가격을 참고해 구매자와 판매자가 함께 참고할 범위를 제시합니다.",
                ],
                [
                  "최근 가격 방향",
                  "짧은 기간의 움직임을 함께 표시해 최저가 근접 여부만으로 판단하지 않도록 돕습니다.",
                ],
              ].map(([title, description]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
              <p className="mt-6 text-xs text-[var(--text-muted)]">
                가격은 다나와 수집 시점 기준입니다. 적정 범위는 참고용 계산이며
                실제 거래를 보장하지 않습니다.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
