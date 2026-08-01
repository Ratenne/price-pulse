import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider, useAppContext } from "./contexts/AppContext";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const RankingsPage = lazy(() => import("./pages/RankingsPage"));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage"));
const SafeTradePage = lazy(() => import("./pages/SafeTradePage"));
const ProductDetailPage = lazy(() => import("./pages/ProductDetailPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const IntroVideo = lazy(() =>
  import("./components/intro/IntroVideo").then(module => ({
    default: module.IntroVideo,
  }))
);

function PageLoading() {
  return (
    <main className="grid min-h-[60vh] place-items-center" aria-live="polite">
      <p className="text-sm text-[var(--text-secondary)]">화면을 불러오는 중입니다.</p>
    </main>
  );
}

function AppContent() {
  const { isLoading, setLoadingComplete } = useAppContext();

  return (
    <>
      <div
        className="app-content"
        aria-hidden={isLoading}
        inert={isLoading ? true : undefined}
      >
        <Suspense fallback={<PageLoading />}>
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
        </Suspense>
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
