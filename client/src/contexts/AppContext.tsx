/**
 * PricePulse App Context - Improved
 * Manages global app state with session storage for intro screen
 */

import { createContext, useContext, useState, ReactNode } from "react";
import type { Product } from "@/domain/product";
import { getProducts } from "@/services/productService";

interface AppContextType {
  isLoading: boolean;
  products: Product[];
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
  const [products] = useState<Product[]>(getProducts);

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
