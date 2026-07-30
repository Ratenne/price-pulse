import type { Product } from "@/domain/product";
import { ProductCard } from "./ProductCard";

export function PriceRangeRanking({ products }: { products: Product[] }) {
  return (
    <section className="bg-[var(--background)] py-14">
      <div className="container">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
            6개월 가격 변동폭 TOP 10
          </h2>
          <p className="mt-2 text-[var(--text-secondary)]">
            최저 가격과 최고 가격의 차이가 컸던 상품을 변동폭 기준으로
            정렬했습니다.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {products.slice(0, 10).map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              rank={index + 1}
              showRangeAmount
            />
          ))}
        </div>
      </div>
    </section>
  );
}
