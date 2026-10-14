import { Moon, Sun, Search } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { BrandLogo } from "./BrandLogo";

const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/rankings", label: "전체 순위" },
  { href: "/categories", label: "카테고리" },
  { href: "/safe-trade", label: "안심거래" },
];

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const [query, setQuery] = useState("");
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Link href="/" className="brand-link" aria-label="PricePulse 홈">
            <BrandLogo variant="symbol" className="sm:hidden" />
            <BrandLogo className="hidden sm:block" />
          </Link>
          <nav className="main-nav" aria-label="주요 메뉴">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={
                  (
                    item.href === "/"
                      ? location === "/"
                      : location.startsWith(item.href)
                  )
                    ? "page"
                    : undefined
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form
            className="header-search"
            role="search"
            action="/rankings"
            method="get"
          >
            <Search size={17} aria-hidden="true" />
            <input
              name="q"
              aria-label="상품 검색"
              placeholder="어떤 상품을 찾으세요?"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </form>
          <button
            type="button"
            onClick={toggleTheme}
            className="icon-button"
            aria-label={
              theme === "light" ? "어두운 테마로 변경" : "밝은 테마로 변경"
            }
          >
            {theme === "light" ? (
              <Moon size={19} aria-hidden="true" />
            ) : (
              <Sun size={19} aria-hidden="true" />
            )}
          </button>
        </div>
      </header>
    </>
  );
}
