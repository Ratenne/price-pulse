/**
 * PricePulse App Context - Improved
 * Manages global app state with session storage for intro screen
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { Product } from "@/domain/product";
import { fetchProducts } from "@/services/productService";

interface AppContextType {
  isLoading: boolean;
  products: Product[];
  productsLoading: boolean;
  productsError: string | null;
  retryProducts: () => void;
  setLoadingComplete: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const INTRO_SEEN_KEY = "pricepulse-intro-seen";

// Helper function to check if intro should be shown
function shouldShowIntro(): boolean {
  // Check for query parameter override
  const params = new URLSearchParams(window.location.search);
  if (params.get("showIntro") === "true") {
    return true;
  }

  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) !== "true";
  } catch {
    // Keep the intro available when storage is blocked.
    return true;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoadingState] = useState(() => shouldShowIntro());
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setProductsLoading(true);
    setProductsError(null);
    fetchProducts(controller.signal)
      .then(setProducts)
      .catch(error => {
        if (!controller.signal.aborted)
          setProductsError(
            error instanceof Error ? error.message : "상품 조회 실패"
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setProductsLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  const setLoadingComplete = () => {
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, "true");
    } catch {
      // The main screen must remain reachable when storage is unavailable.
    }
    setIsLoadingState(false);
  };

  return (
    <AppContext.Provider
      value={{
        isLoading,
        products,
        productsLoading,
        productsError,
        retryProducts: () => setAttempt(value => value + 1),
        setLoadingComplete,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
}
