import type { Product } from "@/domain/product";
import { useTheme } from "@/contexts/ThemeContext";
import { useRef } from "react";
import { Link } from "wouter";
import { AmbientPriceSignalCanvas } from "./AmbientPriceSignalCanvas";
import { PriceHistoryChart } from "./PriceHistoryChart";

export function HeroSection({
  featuredProduct,
  ambientEnabled = true,
}: {
  featuredProduct: Product;
  ambientEnabled?: boolean;
}) {
  const heroRef = useRef<HTMLElement>(null);
  const { theme } = useTheme();

  return (
    <section ref={heroRef} className="main-hero py-14 md:py-20">
      {ambientEnabled && (
        <AmbientPriceSignalCanvas containerRef={heroRef} theme={theme} />
      )}
      <div className="main-hero__content container grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-1 text-xs font-semibold text-[var(--sky-blue-strong)]">
            GPU · CPU · 노트북 가격 흐름
          </span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-[-0.04em] text-[var(--text-primary)] md:text-5xl">
            가격을 비교하는 것을 넘어,
            <br />
            지금 거래해도 괜찮은지 판단합니다
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
            GPU·CPU·노트북의 가격 흐름을 확인하고
            <br className="hidden sm:block" />
            구매자와 판매자 모두에게 적정한 거래 구간을 제공합니다.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/rankings" className="button-primary">
              전체 순위 보기
            </Link>
            <Link href="/categories" className="button-secondary">
              카테고리 보기
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/92 p-5 shadow-sm backdrop-blur-sm">
          <div className="mb-4 flex items-start gap-4">
            <img
              src={featuredProduct.imageUrl}
              alt=""
              className="h-16 w-20 rounded-lg bg-[var(--surface-muted)] object-contain p-2"
              aria-hidden="true"
            />
            <div>
              <p className="text-xs text-[var(--text-muted)]">
                주목할 가격 흐름
              </p>
              <p className="font-semibold text-[var(--text-primary)]">
                {featuredProduct.displayName}
              </p>
            </div>
          </div>
          <PriceHistoryChart product={featuredProduct} height={190} />
        </div>
      </div>
    </section>
  );
}
