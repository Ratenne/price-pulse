import { BrandLogo } from "./BrandLogo";
import { Link } from "wouter";
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div>
            <BrandLogo />
            <p>가격의 흐름을 읽는 더 나은 방법.</p>
          </div>
          <nav aria-label="하단 메뉴">
            <Link href="/rankings">전체 순위</Link>
            <Link href="/categories">카테고리</Link>
            <Link href="/safe-trade">안심거래</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© 2026 PricePulse</span>
          <p>
            과거는 다나와 월별 최저가, 현재가는 조회 시점 기준입니다. 적정
            범위는 참고용입니다.
          </p>
        </div>
      </div>
    </footer>
  );
}
