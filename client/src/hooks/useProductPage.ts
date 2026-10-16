import { useEffect, useState } from "react";
import type { ProductPage } from "@shared/productPage";

const empty: ProductPage = {
  products: [],
  total: 0,
  page: 1,
  pageSize: 10,
  summaries: [],
};
export function useProductPage(query: string, enabled = true) {
  const [state, setState] = useState<{
    key: string;
    data: ProductPage;
    loading: boolean;
    error: string | null;
  }>({ key: query, data: empty, loading: enabled, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ key: query, data: empty, loading: true, error: null });
    async function load() {
      try {
        const res = await fetch(`/api/products?${query}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("상품 정보를 불러오지 못했습니다.");
        const data = (await res.json()) as ProductPage;
        if (controller.signal.aborted) return;
        setState({ key: query, data, loading: false, error: null });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            key: query,
            data: empty,
            loading: false,
            error: error instanceof Error ? error.message : "상품 조회 실패",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [query, enabled, attempt]);
  return {
    ...(enabled && state.key !== query
      ? { data: empty, loading: true, error: null }
      : state),
    retry: () => setAttempt(value => value + 1),
  };
}
