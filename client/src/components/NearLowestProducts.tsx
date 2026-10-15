import { useEffect, useRef, useState } from "react";
import { useProductPage } from "@/hooks/useProductPage";
import { ProductCard } from "./ProductCard";
import { ProductLoadState } from "./ProductLoadState";

export function NearLowestProducts({ category = "" }: { category?: string }) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  const state = useProductPage(`view=near-low&category=${category}`, visible);
  return (
    <div ref={element} className="product-grid" style={{ minHeight: 160 }}>
      {!visible ? (
        <p>화면에 표시할 때 가격을 확인합니다.</p>
      ) : (
        <>
          <ProductLoadState
            loading={state.loading}
            error={state.error}
            retry={state.retry}
          />
          {state.data.products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
          {!state.loading && !state.error && !state.data.products.length && (
            <p>현재 조건에 해당하는 상품이 없습니다.</p>
          )}
        </>
      )}
    </div>
  );
}
