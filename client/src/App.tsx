import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider, useAppContext } from "./contexts/AppContext";
import Dashboard from "./pages/Dashboard";
import RankingsPage from "./pages/RankingsPage";
import CategoriesPage from "./pages/CategoriesPage";
import SafeTradePage from "./pages/SafeTradePage";
import ProductDetailPage from "./pages/ProductDetailPage";

const IntroVideo = lazy(() =>
  import("./components/intro/IntroVideo").then(module => ({
    default: module.IntroVideo,
  }))
);

function AppContent() {
  const { isLoading, setLoadingComplete } = useAppContext();

  return (
    <>
      <div
        className="app-content"
        aria-hidden={isLoading}
        inert={isLoading ? true : undefined}
      >
        <Switch>
          <Route path={"/"}>
            <Dashboard ambientEnabled={!isLoading} />
          </Route>
          <Route path={"/rankings"} component={RankingsPage} />
          <Route path={"/categories"} component={CategoriesPage} />
          <Route path={"/safe-trade"} component={SafeTradePage} />
          <Route path="/products/:id">
            {params => <ProductDetailPage id={params.id} />}
          </Route>
          <Route path={"/404"} component={NotFound} />
          {/* Final fallback route */}
          <Route component={NotFound} />
        </Switch>
      </div>
      {isLoading && (
        <Suspense
          fallback={
            <div
              className="intro-video intro-video--suspense"
              aria-label="PricePulse 시작 화면 준비 중"
            >
              <div className="intro-video__fallback-brand">
                <span className="intro-video__fallback-symbol">₩</span>
                <span>PricePulse</span>
              </div>
            </div>
          }
        >
          <IntroVideo onComplete={setLoadingComplete} />
        </Suspense>
      )}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AppProvider>
            <AppContent />
          </AppProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
