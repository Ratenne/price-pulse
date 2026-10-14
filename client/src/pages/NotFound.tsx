import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { SearchX, ArrowRight } from "lucide-react";
import { Link } from "wouter";
export default function NotFound() {
  return (
    <div className="app-shell">
      <Header />
      <main id="main-content" className="container not-found">
        <div className="empty-state">
          <SearchX size={40} aria-hidden="true" />
          <h1 className="text-3xl font-bold">페이지를 찾을 수 없습니다</h1>
          <p>
            주소가 변경되었거나 상품이 존재하지 않습니다.
            <br />
            전체 순위에서 원하는 상품을 다시 찾아보세요.
          </p>
          <Link className="button-primary" href="/rankings">
            전체 순위로 이동 <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
